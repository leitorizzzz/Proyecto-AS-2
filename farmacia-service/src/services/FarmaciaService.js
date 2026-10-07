const Medicamento = require('../models/Medicamento');
const Dispensacion = require('../models/Dispensacion');
const Prescripcion = require('../models/Prescripcion');

/** Descuento que la fundacion otorga a los miembros del asilo (RN-09) */
const DESCUENTO_FUNDACION = 0.20; // 20%

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

  listarMedicamentos() {
    return this.medicamentoRepo.obtenerTodos();
  }

  async obtenerMedicamento(id) {
    const medicamento = await this.medicamentoRepo.obtenerPorId(id);
    if (!medicamento) throw Object.assign(new Error('Medicamento no encontrado'), { status: 404 });
    return medicamento;
  }

  registrarMedicamento(datos) {
    if (!datos.nombre || datos.nombre.trim() === '') {
      throw Object.assign(new Error('El nombre del medicamento es requerido'), { status: 400 });
    }
    if (datos.precioUnitario === undefined || datos.precioUnitario < 0) {
      throw Object.assign(new Error('El precio unitario debe ser un valor valido'), { status: 400 });
    }
    const medicamento = new Medicamento({
      nombre: datos.nombre,
      presentacion: datos.presentacion || '',
      stock: datos.stock || 0,
      precioUnitario: datos.precioUnitario
    });
    return this.medicamentoRepo.guardar(medicamento);
  }

  async actualizarMedicamento(id, datos) {
    await this.obtenerMedicamento(id);
    return this.medicamentoRepo.actualizar(id, datos);
  }

  async eliminarMedicamento(id) {
    await this.obtenerMedicamento(id);
    return this.medicamentoRepo.eliminar(id);
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
        new Error('idPrescripcion es requerido (RN-06: se exige prescripcion valida para dispensar)'),
        { status: 400 }
      );
    }
    if (!cantidad || Number(cantidad) <= 0) {
      throw Object.assign(new Error('La cantidad debe ser mayor a 0'), { status: 400 });
    }

    const prescripcion = await this.prescripcionRepo.obtenerPorId(Number(idPrescripcion));
    if (!prescripcion) {
      throw Object.assign(
        new Error(`No existe la prescripcion ${idPrescripcion}`),
        { status: 404 }
      );
    }
    if (prescripcion.estado !== Prescripcion.ESTADOS.PENDIENTE) {
      throw Object.assign(
        new Error(`La prescripcion ${idPrescripcion} ya fue dispensada o no esta activa (estado: '${prescripcion.estado}')`),
        { status: 409 }
      );
    }
    if (!prescripcion.idMedicamento) {
      throw Object.assign(
        new Error(`La prescripcion ${idPrescripcion} no tiene medicamento del inventario asociado; el especialista debe asociarla antes de dispensar`),
        { status: 400 }
      );
    }
    if (idPaciente != null && Number(idPaciente) !== Number(prescripcion.idPaciente)) {
      throw Object.assign(
        new Error(`La prescripcion ${idPrescripcion} pertenece al paciente ${prescripcion.idPaciente}, no al ${idPaciente}`),
        { status: 400 }
      );
    }

    const medicamento = await this.obtenerMedicamento(prescripcion.idMedicamento);

    if (!medicamento.tieneStockSuficiente(Number(cantidad))) {
      throw Object.assign(
        new Error(`Stock insuficiente de ${medicamento.getNombre()}. Disponible: ${medicamento.getStock()}`),
        { status: 409 }
      );
    }

    const costoTotal = this.calcularCosto(medicamento.getPrecioUnitario(), Number(cantidad));

    await this.medicamentoRepo.actualizarStock(
      prescripcion.idMedicamento,
      medicamento.getStock() - Number(cantidad)
    );

    const dispensacion = new Dispensacion({
      idPaciente: prescripcion.idPaciente,
      idVisita: prescripcion.idVisita,
      idMedicamento: prescripcion.idMedicamento,
      cantidad: Number(cantidad),
      costoTotal
    });
    const guardada = await this.dispensacionRepo.guardar(dispensacion);

    await this.prescripcionRepo.marcarDispensada(prescripcion.id, guardada.id);

    return {
      ...guardada,
      idPrescripcion: prescripcion.id,
      medicamento: medicamento.getNombre()
    };
  }

  calcularCosto(precioUnitario, cantidad) {
    const subtotal = precioUnitario * cantidad;
    const costoConDescuento = subtotal * (1 - DESCUENTO_FUNDACION);
    return Math.round(costoConDescuento * 100) / 100;
  }

  async historialPorPaciente(idPaciente) {
    const dispensaciones = await this.dispensacionRepo.obtenerPorPaciente(idPaciente);
    const totalGastado = dispensaciones.reduce((acc, d) => acc + Number(d.costoTotal), 0);
    return {
      dispensaciones,
      totalGastado: Math.round(totalGastado * 100) / 100
    };
  }
}

module.exports = FarmaciaService;
