const Medicamento = require('../models/Medicamento');
const Dispensacion = require('../models/Dispensacion');

/** Descuento que la fundacion otorga a los miembros del asilo */
const DESCUENTO_FUNDACION = 0.20; // 20%

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Contiene TODAS las reglas del negocio de farmacia:
 * validaciones, calculo de costos con descuento y control de stock.
 * No conoce SQL ni como se muestra en pantalla; solo usa los repositorios.
 */
class FarmaciaService {
  constructor(medicamentoRepository, dispensacionRepository) {
    this.medicamentoRepo = medicamentoRepository;
    this.dispensacionRepo = dispensacionRepository;
  }

  listarMedicamentos() {
    return this.medicamentoRepo.obtenerTodos();
  }

  async obtenerMedicamento(id) {
    const medicamento = await this.medicamentoRepo.obtenerPorId(id);
    if (!medicamento) throw new Error('Medicamento no encontrado');
    return medicamento;
  }

  registrarMedicamento(datos) {
    if (!datos.nombre || datos.nombre.trim() === '') {
      throw new Error('El nombre del medicamento es requerido');
    }
    if (datos.precioUnitario === undefined || datos.precioUnitario < 0) {
      throw new Error('El precio unitario debe ser un valor valido');
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
    await this.obtenerMedicamento(id); // valida que exista
    return this.medicamentoRepo.actualizar(id, datos);
  }

  async eliminarMedicamento(id) {
    await this.obtenerMedicamento(id);
    return this.medicamentoRepo.eliminar(id);
  }

  /**
   * Regla de negocio principal: dispensar un medicamento a un paciente.
   * 1. Verifica que exista stock suficiente.
   * 2. Calcula el costo aplicando el descuento de la fundacion.
   * 3. Descuenta el stock.
   * 4. Registra la dispensacion (para el modulo financiero).
   */
  async dispensarMedicamento({ idPaciente, idVisita, idMedicamento, cantidad }) {
    if (!idPaciente) throw new Error('idPaciente es requerido');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');

    const medicamento = await this.obtenerMedicamento(idMedicamento);

    if (!medicamento.tieneStockSuficiente(cantidad)) {
      throw new Error(`Stock insuficiente. Disponible: ${medicamento.getStock()}`);
    }

    const costoTotal = this.calcularCosto(medicamento.getPrecioUnitario(), cantidad);

    await this.medicamentoRepo.actualizarStock(idMedicamento, medicamento.getStock() - cantidad);

    const dispensacion = new Dispensacion({
      idPaciente,
      idVisita,
      idMedicamento,
      cantidad,
      costoTotal
    });

    return this.dispensacionRepo.guardar(dispensacion);
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
