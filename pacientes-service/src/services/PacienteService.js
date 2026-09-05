const Paciente = require('../models/Paciente');

const GENEROS_VALIDOS = ['M', 'F', 'Otro'];
const DPI_REGEX = /^\d{13}$/; // DPI de Guatemala: 13 digitos

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Validaciones y reglas del dominio de pacientes.
 */
class PacienteService {
  constructor(pacienteRepository) {
    this.repo = pacienteRepository;
  }

  listar() {
    return this.repo.obtenerTodos();
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
    if (existente) throw new Error('Ya existe un paciente con ese DPI');

    const paciente = new Paciente(datos);
    return this.repo.guardar(paciente);
  }

  async actualizar(id, datos) {
    await this.obtener(id);
    this._validar(datos);

    const conMismoDpi = await this.repo.obtenerPorDpi(datos.dpi);
    if (conMismoDpi && conMismoDpi.id !== id) {
      throw new Error('Ya existe otro paciente con ese DPI');
    }

    const paciente = new Paciente({ ...datos, id });
    return this.repo.actualizar(id, paciente);
  }

  async eliminar(id) {
    await this.obtener(id);
    return this.repo.eliminar(id);
  }
}

module.exports = PacienteService;
