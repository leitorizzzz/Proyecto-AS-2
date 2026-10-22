const Paciente = require('../models/Paciente');
const { asegurarFamiliarCompleto } = require('./reglasFamiliar');

const GENEROS_VALIDOS = ['M', 'F', 'Otro'];
const DPI_REGEX = /^\d{13}$/; // DPI de Guatemala: 13 digitos

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Validaciones y reglas del dominio de pacientes.
 */
class PacienteService {
  constructor(pacienteRepository, familiarRepository) {
    this.repo = pacienteRepository;
    this.familiarRepo = familiarRepository;
  }

  /** Por defecto solo activos. El controlador decide quien puede ver inactivos. */
  async listar({ incluirInactivos = false } = {}) {
    const pacientes = await this.repo.obtenerTodos({ incluirInactivos });
    if (!this.familiarRepo) return pacientes;
    const familiares = await this.familiarRepo.principalesDe(pacientes.map(p => p.id));
    return pacientes.map(p => ({ ...p, familiar: familiares.find(f => f.idPaciente === p.id) || null }));
  }

  /** Paciente con su familiar responsable principal y su ficha medica. */
  async obtenerDetalle(id) {
    const paciente = await this.obtener(id);
    const [familiar, ficha] = await Promise.all([
      this.familiarRepo ? this.familiarRepo.obtenerPrincipal(id) : null,
      this.repo.obtenerFicha ? this.repo.obtenerFicha(id) : null
    ]);
    return { ...paciente, familiar, ficha };
  }

  async obtener(id) {
    const paciente = await this.repo.obtenerPorId(id);
    if (!paciente) throw new Error('Paciente no encontrado');
    return paciente;
  }

  _validar(datos) {
    if (!datos.nombres || datos.nombres.trim() === '') {
      throw new Error('Los nombres son requeridos');
    }
    if (!datos.apellidos || datos.apellidos.trim() === '') {
      throw new Error('Los apellidos son requeridos');
    }
    if (!datos.fechaNacimiento || isNaN(Date.parse(datos.fechaNacimiento))) {
      throw new Error('La fecha de nacimiento no es valida');
    }
    if (!GENEROS_VALIDOS.includes(datos.genero)) {
      throw new Error(`Genero invalido. Debe ser uno de: ${GENEROS_VALIDOS.join(', ')}`);
    }
    if (!datos.dpi || !DPI_REGEX.test(String(datos.dpi))) {
      throw new Error('El DPI debe tener exactamente 13 digitos');
    }
  }

  async registrar(datos) {
    this._validar(datos);
    const existente = await this.repo.obtenerPorDpi(datos.dpi);
    if (existente) {
      throw new Error(existente.activo === false
        ? 'Ya existe un paciente desactivado con ese DPI; un administrador puede reactivarlo'
        : 'Ya existe un paciente con ese DPI');
    }

    // Caso 5: el alta exige el familiar responsable con datos completos
    // (caso 20); su correo es el que recibe los avisos de solicitudes.
    const familiar = asegurarFamiliarCompleto(datos.familiar);
    const paciente = new Paciente({ ...datos, familiarEmail: familiar.email });
    const creado = await this.repo.guardarConFamiliar(paciente, familiar);
    return this.obtenerDetalle(creado.id);
  }

  /** Alta o correccion del familiar responsable principal (datos completos). */
  async actualizarFamiliar(id, datos) {
    await this.obtener(id);
    const familiar = asegurarFamiliarCompleto(datos);
    await this.familiarRepo.guardarPrincipal(id, familiar);
    await this.repo.actualizarFamiliarEmail(id, familiar.email);
    return this.obtenerDetalle(id);
  }

  async actualizar(id, datos) {
    const actual = await this.obtener(id);
    this._validar(datos);

    const conMismoDpi = await this.repo.obtenerPorDpi(datos.dpi);
    if (conMismoDpi && conMismoDpi.id !== id) {
      throw new Error('Ya existe otro paciente con ese DPI');
    }

    // El correo de avisos es siempre el del familiar responsable (se cambia
    // con PUT /:id/familiar); editar el expediente no lo puede desalinear.
    const paciente = new Paciente({ ...datos, id, familiarEmail: actual.familiarEmail });
    return this.repo.actualizar(id, paciente);
  }

  /**
   * Borrado logico (DELETE /api/pacientes/:id). Conserva solicitudes,
   * visitas, dispensaciones y cuenta; el paciente deja de aparecer en los
   * listados y no puede recibir nuevas atenciones.
   */
  async desactivar(id) {
    const paciente = await this.obtener(id);
    if (paciente.activo === false) {
      throw Object.assign(new Error('El paciente ya esta desactivado'), { status: 409 });
    }
    return this.repo.cambiarActivo(id, false);
  }

  async reactivar(id) {
    const paciente = await this.obtener(id);
    if (paciente.activo !== false) {
      throw Object.assign(new Error('El paciente ya esta activo'), { status: 409 });
    }
    return this.repo.cambiarActivo(id, true);
  }
}

module.exports = PacienteService;
