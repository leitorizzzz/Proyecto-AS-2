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
  /**
   * Caso 6: egreso del interno (baja logica). Exige motivoEgreso (3 a 300
   * caracteres); fechaEgreso es opcional (YYYY-MM-DD, por defecto ahora),
   * no puede ser futura ni anterior al ingreso.
   */
  async desactivar(id, { motivoEgreso, fechaEgreso } = {}) {
    const paciente = await this.obtener(id);
    if (paciente.activo === false) {
      throw Object.assign(new Error('El paciente ya esta desactivado'), { status: 409 });
    }
    const motivo = String(motivoEgreso ?? '').trim();
    if (motivo.length < 3 || motivo.length > 300) {
      throw Object.assign(new Error('motivoEgreso es requerido (3 a 300 caracteres)'), { status: 400 });
    }
    // Por defecto hoy (dia de Guatemala, UTC-6), a mediodia.
    const hoyGt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let fecha = new Date(`${hoyGt}T18:00:00Z`);
    if (fechaEgreso != null && fechaEgreso !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEgreso)) || isNaN(Date.parse(`${fechaEgreso}T12:00:00Z`))) {
        throw Object.assign(new Error('fechaEgreso debe tener formato YYYY-MM-DD'), { status: 400 });
      }
      // Mediodia de Guatemala (18:00 UTC): la fecha no cambia al mostrarla en UTC-6.
      fecha = new Date(`${fechaEgreso}T18:00:00Z`);
      if (fecha.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        throw Object.assign(new Error('fechaEgreso no puede ser futura'), { status: 400 });
      }
      if (paciente.fechaIngreso && fecha < new Date(String(paciente.fechaIngreso).slice(0, 10))) {
        throw Object.assign(new Error('fechaEgreso no puede ser anterior al ingreso'), { status: 400 });
      }
    }
    return this.repo.cambiarActivo(id, false, { fechaEgreso: fecha, motivoEgreso: motivo });
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
