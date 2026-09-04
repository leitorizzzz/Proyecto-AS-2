/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa la entrega de un medicamento a un paciente,
 * ligada a una visita medica, con el costo aplicado (con descuento de fundacion).
 */
class Dispensacion {
  constructor({ id, idPaciente, idVisita, idMedicamento, cantidad, costoTotal, fecha }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.idVisita = idVisita || null;
    this.idMedicamento = idMedicamento;
    this.cantidad = cantidad;
    this.costoTotal = costoTotal;
    this.fecha = fecha || new Date().toISOString();
  }
}

module.exports = Dispensacion;
