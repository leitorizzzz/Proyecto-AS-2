const Medicamento = require('../models/Medicamento');
const Prescripcion = require('../models/Prescripcion');

/** Descuento que la fundacion otorga a los miembros del asilo (RN-09) */
const DESCUENTO_FUNDACION = 0.20; // 20%
/** Limites del inventario: INT y DECIMAL(10,2) en la tabla medicamentos. */
const MAX_STOCK = 1000000;
const MAX_PRECIO = 99999999.99;

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Contiene TODAS las reglas del negocio de farmacia:
 * validaciones, calculo de costos con descuento y control de stock.
 * No conoce SQL ni como se muestra en pantalla; solo usa los repositorios.
 *
 * RN-06 (prescripcion valida antes de despacho) se implementa aqui en
 * dispensarMedicamento: toda dispensacion debe estar amarrada a una
 * prescripcion pendiente de la misma persona.
 */
class FarmaciaService {
  constructor(medicamentoRepository, dispensacionRepository, prescripcionRepository) {
    this.medicamentoRepo = medicamentoRepository;
    this.dispensacionRepo = dispensacionRepository;
    this.prescripcionRepo = prescripcionRepository;
  }

  listarMedicamentos({ incluirInactivos = false } = {}) {
    return this.medicamentoRepo.obtenerTodos({ incluirInactivos });
  }

  async obtenerMedicamento(id) {
    const medicamento = await this.medicamentoRepo.obtenerPorId(id);
    if (!medicamento) throw Object.assign(new Error('Medicamento no encontrado'), { status: 404 });
    return medicamento;
  }

  /**
   * Valida y normaliza los datos de un medicamento (alta y edicion).
   * Stock entero >= 0 y precio > 0 con hasta 2 decimales: un stock negativo
   * o un precio 0 dejarian el inventario y los costos de RN-09 mal.
   */
  _validarMedicamento(datos) {
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
    if (!nombre) throw Object.assign(new Error('El nombre del medicamento es requerido'), { status: 400 });
    if (nombre.length > 200) throw Object.assign(new Error('El nombre no puede pasar de 200 caracteres'), { status: 400 });
    const presentacion = datos.presentacion == null ? '' : String(datos.presentacion).trim();
    if (presentacion.length > 200) throw Object.assign(new Error('La presentación no puede pasar de 200 caracteres'), { status: 400 });
    const stock = datos.stock === undefined || datos.stock === null || datos.stock === '' ? 0 : Number(datos.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      throw Object.assign(new Error(`El stock debe ser un número entero entre 0 y ${MAX_STOCK}`), { status: 400 });
    }
    const precio = Number(datos.precioUnitario);
    if (datos.precioUnitario === null || datos.precioUnitario === '' || !Number.isFinite(precio)
        || precio <= 0 || precio > MAX_PRECIO || Math.round(precio * 100) !== +(precio * 100).toFixed(6)) {
      throw Object.assign(new Error(`El precio unitario debe ser mayor a 0, hasta Q${MAX_PRECIO} y con 2 decimales como máximo`), { status: 400 });
    }
    return { nombre, presentacion, stock, precioUnitario: precio };
  }

  /** No puede haber dos medicamentos activos con el mismo nombre y presentacion. */
  async _asegurarSinDuplicado({ nombre, presentacion }, exceptoId = null) {
    const otro = await this.medicamentoRepo.buscarActivoPorNombre(nombre, presentacion);
    if (otro && otro.id !== exceptoId) {
      throw Object.assign(
        new Error(`Ya existe en el inventario "${otro.nombre}"${otro.presentacion ? ` (${otro.presentacion})` : ''}; actualice su stock en lugar de crear otro`),
        { status: 409 });
    }
  }

  async registrarMedicamento(datos) {
    const valido = this._validarMedicamento(datos);
    await this._asegurarSinDuplicado(valido);
    return this.medicamentoRepo.guardar(new Medicamento(valido));
  }

  async actualizarMedicamento(id, datos) {
    const actual = await this.obtenerMedicamento(id);
    // PUT con campos omitidos conserva los actuales (antes los dejaba en NULL).
    const valido = this._validarMedicamento({
      nombre: datos.nombre ?? actual.nombre,
      presentacion: datos.presentacion ?? actual.presentacion,
      stock: datos.stock ?? actual.stock,
      precioUnitario: datos.precioUnitario ?? actual.precioUnitario
    });
    await this._asegurarSinDuplicado(valido, actual.id);
    return this.medicamentoRepo.actualizar(id, valido);
  }

  /** DELETE /medicamentos/:id = borrado logico; las dispensaciones se conservan. */
  async desactivarMedicamento(id) {
    const medicamento = await this.obtenerMedicamento(id);
    if (medicamento.activo === false) {
      throw Object.assign(new Error('El medicamento ya está desactivado'), { status: 409 });
    }
    return this.medicamentoRepo.cambiarActivo(id, false);
  }

  async reactivarMedicamento(id) {
    const medicamento = await this.obtenerMedicamento(id);
    if (medicamento.activo !== false) {
      throw Object.assign(new Error('El medicamento ya está activo'), { status: 409 });
    }
    return this.medicamentoRepo.cambiarActivo(id, true);
  }

  /**
   * Prescripciones pendientes de dispensacion para un paciente.
   * Lee visita_prescripciones directamente (BD compartida), mismo patron
   * que usa laboratorio-service con visita_examenes.
   */
  async prescripcionesPendientesPaciente(idPaciente) {
    if (!idPaciente) {
      throw Object.assign(new Error('idPaciente es requerido'), { status: 400 });
    }
    return this.prescripcionRepo.listarPendientesPorPaciente(Number(idPaciente));
  }

  /**
   * Regla de negocio principal: dispensar un medicamento a un paciente.
   *
   * RN-06: toda dispensacion debe venir amarrada a una prescripcion
   *        pendiente, de una visita medica real, y del mismo paciente.
   * RN-09: al calcular costo se aplica el 20% de descuento de fundacion.
   *
   * Pasos:
   *   1. Valida la prescripcion (existe, pendiente, mismo paciente,
   *      tiene idMedicamento asociado).
   *   2. Verifica stock suficiente del medicamento prescrito.
   *   3. Descuenta inventario, calcula costo con descuento,
   *      guarda la dispensacion.
   *   4. Marca la prescripcion como 'dispensada' con el idDispensacion
   *      recien creado -> no se puede re-dispensar.
   */
  async dispensarMedicamento({ idPrescripcion, idPaciente, cantidad }) {
    if (!idPrescripcion) {
      throw Object.assign(
        new Error('Elija la prescripción a dispensar: solo se entrega lo que un médico recetó en una visita.'),
        { status: 400 }
      );
    }
    if (!Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0) {
      throw Object.assign(new Error('La cantidad debe ser un entero mayor a 0'), { status: 400 });
    }

    const prescripcion = await this.prescripcionRepo.obtenerPorId(Number(idPrescripcion));
    if (!prescripcion) {
      throw Object.assign(
        new Error(`No existe la prescripción ${idPrescripcion}`),
        { status: 404 }
      );
    }
    if (!prescripcion.admiteDespacho()) {
      throw Object.assign(
        new Error(`La prescripción #${idPrescripcion} ya fue entregada por completo o no está activa.`),
        { status: 409 }
      );
    }
    if (!prescripcion.idMedicamento) {
      throw Object.assign(
        new Error(`La prescripción ${idPrescripcion} no tiene medicamento del inventario asociado; el especialista debe asociarla antes de dispensar`),
        { status: 400 }
      );
    }
    if (idPaciente != null && Number(idPaciente) !== Number(prescripcion.idPaciente)) {
      throw Object.assign(
        new Error(`La prescripción ${idPrescripcion} pertenece al paciente ${prescripcion.idPaciente}, no al ${idPaciente}`),
        { status: 400 }
      );
    }

    if (prescripcion.pacienteActivo === false) {
      throw Object.assign(
        new Error(`El paciente ${prescripcion.idPaciente} esta desactivado: no se le pueden dispensar medicamentos. Un administrador puede reactivarlo.`),
        { status: 409 }
      );
    }

    const medicamento = await this.obtenerMedicamento(prescripcion.idMedicamento);
    if (medicamento.activo === false) {
      throw Object.assign(
        new Error(`El medicamento ${medicamento.getNombre()} esta desactivado en el inventario`),
        { status: 409 }
      );
    }

    if (!medicamento.tieneStockSuficiente(Number(cantidad))) {
      throw Object.assign(
        new Error(`Stock insuficiente de ${medicamento.getNombre()}. Disponible: ${medicamento.getStock()}`),
        { status: 409 }
      );
    }

    // Despacho parcial (caso 18): no se entrega mas de lo que falta.
    if (prescripcion.cantidadRestante != null && Number(cantidad) > prescripcion.cantidadRestante) {
      throw Object.assign(
        new Error(`La cantidad ${cantidad} excede lo pendiente de la prescripción ${idPrescripcion}: ` +
                  `faltan ${prescripcion.cantidadRestante} de ${prescripcion.cantidadPrescrita}`),
        { status: 409 }
      );
    }

    const montoBase = Math.round(medicamento.getPrecioUnitario() * Number(cantidad) * 100) / 100;
    const costoTotal = this.calcularCosto(medicamento.getPrecioUnitario(), Number(cantidad));

    // Stock, entregado, estado de la prescripcion, costo acumulado de la
    // visita y (si la visita ya cerro) cargo complementario: todo o nada.
    const r = await this.dispensacionRepo.registrarDespacho({
      idPrescripcion: prescripcion.id,
      idVisita: prescripcion.idVisita,
      idPaciente: prescripcion.idPaciente,
      idMedicamento: prescripcion.idMedicamento,
      medicamento: medicamento.getNombre(),
      cantidad: Number(cantidad),
      montoBase,
      costoTotal
    });

    return {
      ...r.dispensacion,
      idPrescripcion: prescripcion.id,
      medicamento: medicamento.getNombre(),
      estadoPrescripcion: r.estadoPrescripcion,
      cantidadPrescrita: r.cantidadPrescrita,
      cantidadEntregada: r.cantidadEntregada,
      cantidadRestante: r.cantidadPrescrita != null ? r.cantidadPrescrita - r.cantidadEntregada : 0,
      cargoComplementario: r.cargoComplementario
    };
  }

  calcularCosto(precioUnitario, cantidad) {
    const subtotal = precioUnitario * cantidad;
    const costoConDescuento = subtotal * (1 - DESCUENTO_FUNDACION);
    return Math.round(costoConDescuento * 100) / 100;
  }

  async historialPorPaciente(idPaciente) {
    // Precio base y descuento de cada despacho (los anteriores sin montoBase
    // se reconstruyen con el precio unitario).
    const dispensaciones = (await this.dispensacionRepo.obtenerPorPaciente(idPaciente)).map(d => {
      const base = d.montoBase != null ? Number(d.montoBase)
        : (d.precioUnitario != null ? Math.round(d.precioUnitario * d.cantidad * 100) / 100 : null);
      return { ...d, montoBase: base, descuento: base != null ? Math.round((base - Number(d.costoTotal)) * 100) / 100 : null };
    });
    const totalGastado = dispensaciones.reduce((acc, d) => acc + Number(d.costoTotal), 0);
    return {
      dispensaciones,
      totalGastado: Math.round(totalGastado * 100) / 100
    };
  }
}

module.exports = FarmaciaService;
