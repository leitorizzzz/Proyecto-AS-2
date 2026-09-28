const ResultadoExamen = require('../models/ResultadoExamen');

const TIPOS_VALIDOS = new Set(Object.values(ResultadoExamen.TIPOS));

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas del dominio de Laboratorio.
 * - Identificar paciente por DPI (usa la tabla compartida de pacientes).
 * - Registrar resultado y marcar la orden como 'disponible' de forma
 *   atomica desde la capa de servicio.
 * - Calcular costo de un examen aplicando el descuento de fundacion
 *   (RN-09: 20% por defecto, configurable en .env).
 */
class LaboratorioService {
  constructor(resultadoRepo, pacienteRepo) {
    this.repo = resultadoRepo;
    this.pacienteRepo = pacienteRepo;
    this.descuento = Number(process.env.DESCUENTO_FUNDACION || 0.20);
  }

  ordenesPendientes() {
    return this.repo.listarOrdenesPendientes();
  }

  async identificarPaciente(dpi) {
    if (!dpi) {
      throw Object.assign(new Error('dpi es requerido'), { status: 400 });
    }
    const paciente = await this.pacienteRepo.obtenerPorDpi(String(dpi));
    if (!paciente) {
      throw Object.assign(new Error('Paciente no encontrado con ese DPI'), { status: 404 });
    }
    return paciente;
  }

  async registrarResultado(idExamen, datos) {
    if (!idExamen || Number.isNaN(Number(idExamen))) {
      throw Object.assign(new Error('idExamen es requerido'), { status: 400 });
    }
    if (!datos || !TIPOS_VALIDOS.has(datos.tipoResultado)) {
      throw Object.assign(
        new Error(`tipoResultado debe ser uno de: ${[...TIPOS_VALIDOS].join(', ')}`),
        { status: 400 }
      );
    }

    const orden = await this.repo.obtenerOrdenPorId(Number(idExamen));
    if (!orden) {
      throw Object.assign(new Error('Orden de examen no encontrada'), { status: 404 });
    }

    const yaExiste = await this.repo.obtenerResultadoPorExamen(Number(idExamen));
    if (yaExiste) {
      throw Object.assign(
        new Error(`Ya existe un resultado para el examen ${idExamen}`),
        { status: 409 }
      );
    }

    // Validar coherencia entre tipo y valores
    if (datos.tipoResultado === ResultadoExamen.TIPOS.NUMERICO && datos.valorNumerico == null) {
      throw Object.assign(new Error('valorNumerico es requerido para tipoResultado numerico'), { status: 400 });
    }
    if (datos.tipoResultado === ResultadoExamen.TIPOS.TEXTO
        && (!datos.valorTexto || String(datos.valorTexto).trim() === '')) {
      throw Object.assign(new Error('valorTexto es requerido para tipoResultado texto'), { status: 400 });
    }
    if (datos.tipoResultado === ResultadoExamen.TIPOS.ARCHIVO
        && (!datos.archivoAdjunto || String(datos.archivoAdjunto).trim() === '')) {
      throw Object.assign(new Error('archivoAdjunto es requerido para tipoResultado archivo'), { status: 400 });
    }

    const resultado = new ResultadoExamen({
      idExamen: Number(idExamen),
      tipoResultado: datos.tipoResultado,
      valorTexto: datos.valorTexto,
      valorNumerico: datos.valorNumerico,
      archivoAdjunto: datos.archivoAdjunto,
      estado: ResultadoExamen.ESTADOS.REGISTRADO
    });
    resultado.marcarDisponible();

    const guardado = await this.repo.guardar(resultado);
    await this.repo.marcarOrdenComoDisponible(Number(idExamen));
    return guardado;
  }

  async obtenerResultadoPorExamen(idExamen) {
    const resultado = await this.repo.obtenerResultadoPorExamen(Number(idExamen));
    if (!resultado) {
      throw Object.assign(new Error('Resultado no encontrado'), { status: 404 });
    }
    return resultado;
  }

  /**
   * Calcula el costo del examen aplicando el descuento de fundacion (RN-09).
   * Devuelve precioBase, descuento y total ya redondeados a 2 decimales.
   */
  async calcularCostoConDescuento(idExamen) {
    const orden = await this.repo.obtenerOrdenPorId(Number(idExamen));
    if (!orden) {
      throw Object.assign(new Error('Orden de examen no encontrada'), { status: 404 });
    }
    const precioBase = await this.repo.obtenerPrecioBase(orden.tipo);
    if (precioBase == null) {
      throw Object.assign(
        new Error(`No hay precio configurado para el tipo de examen "${orden.tipo}"`),
        { status: 404 }
      );
    }
    const montoDescuento = precioBase * this.descuento;
    const total = precioBase - montoDescuento;
    return {
      idExamen: orden.id,
      tipo: orden.tipo,
      precioBase: this._r(precioBase),
      descuentoFundacion: this._r(montoDescuento),
      porcentajeDescuento: this.descuento,
      total: this._r(total)
    };
  }

  _r(n) { return Math.round(Number(n) * 100) / 100; }
}

module.exports = LaboratorioService;
