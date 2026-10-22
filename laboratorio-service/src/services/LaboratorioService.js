const ResultadoExamen = require('../models/ResultadoExamen');
const PrecioExamen = require('../models/PrecioExamen');

const TIPOS_VALIDOS = new Set(Object.values(ResultadoExamen.TIPOS));

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas del dominio de Laboratorio.
 * - Identificar paciente por DPI (usa la tabla compartida de pacientes).
 * - Registrar resultado y marcar la orden como 'disponible' de forma
 *   atomica desde la capa de servicio.
 * - Calcular costo de un examen aplicando el descuento de fundacion
 *   (RN-09: 20% por defecto, configurable en .env).
 * - Mantener el catalogo de precios base por tipo de examen.
 */
class LaboratorioService {
  constructor(resultadoRepo, pacienteRepo, precioRepo) {
    this.repo = resultadoRepo;
    this.pacienteRepo = pacienteRepo;
    this.precioRepo = precioRepo;
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
    // Caso 15: si la orden trae el costo registrado al pedirla, ese manda
    // (un cambio posterior del catalogo no lo altera).
    if (orden.costo != null && orden.precioBase != null) {
      return {
        idExamen: orden.id,
        tipo: orden.tipo,
        precioBase: this._r(orden.precioBase),
        descuentoFundacion: this._r(orden.descuento),
        porcentajeDescuento: this.descuento,
        total: this._r(orden.costo),
        registradoAlOrdenar: true
      };
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
      total: this._r(total),
      registradoAlOrdenar: false
    };
  }

  // --- Catalogo de precios ---

  /** Cada precio incluye lo que paga el residente con RN-09 aplicado. */
  async listarPrecios() {
    const precios = await this.precioRepo.listar();
    return precios.map(p => this._conDescuento(p));
  }

  async crearPrecio(datos) {
    const precio = this._validarPrecio(datos);
    if (await this.precioRepo.obtenerPorTipo(precio.tipo)) {
      throw Object.assign(new Error(`Ya existe un precio para el examen "${precio.tipo}"`), { status: 409 });
    }
    return this._conDescuento(await this.precioRepo.guardar(precio));
  }

  async actualizarPrecio(id, datos) {
    const actual = await this.precioRepo.obtenerPorId(Number(id));
    if (!actual) throw Object.assign(new Error('Precio de examen no encontrado'), { status: 404 });
    const precio = this._validarPrecio({ tipo: actual.tipo, ...datos });
    const conMismoTipo = await this.precioRepo.obtenerPorTipo(precio.tipo);
    if (conMismoTipo && conMismoTipo.id !== actual.id) {
      throw Object.assign(new Error(`Ya existe un precio para el examen "${precio.tipo}"`), { status: 409 });
    }
    return this._conDescuento(await this.precioRepo.actualizar(actual.id, precio));
  }

  _validarPrecio({ tipo, precioBase }) {
    const t = String(tipo || '').trim();
    if (!t) throw Object.assign(new Error('tipo es requerido'), { status: 400 });
    if (t.length > 200) throw Object.assign(new Error('tipo admite maximo 200 caracteres'), { status: 400 });
    const p = Number(precioBase);
    if (precioBase == null || precioBase === '' || !Number.isFinite(p) || p <= 0) {
      throw Object.assign(new Error('precioBase debe ser un numero mayor a 0'), { status: 400 });
    }
    return new PrecioExamen({ tipo: t, precioBase: this._r(p) });
  }

  _conDescuento(precio) {
    return {
      id: precio.id,
      tipo: precio.tipo,
      precioBase: this._r(precio.precioBase),
      porcentajeDescuento: this.descuento,
      precioConDescuento: this._r(precio.precioBase * (1 - this.descuento))
    };
  }

  _r(n) { return Math.round(Number(n) * 100) / 100; }
}

module.exports = LaboratorioService;
