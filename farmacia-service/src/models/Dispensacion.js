/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa la entrega de un medicamento a un paciente,
 * ligada a una visita medica, con el costo aplicado (con descuento de fundacion).
 */
class Dispensacion {
  constructor({ id, idPaciente, idVisita, idMedicamento, cantidad, costoTotal, fecha, idPrescripcion, montoBase }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.idVisita = idVisita || null;
    this.idMedicamento = idMedicamento;
    this.cantidad = cantidad;
    this.costoTotal = costoTotal;
    this.fecha = fecha || new Date().toISOString();
    this.idPrescripcion = idPrescripcion ?? null;
    this.montoBase = montoBase != null ? Number(montoBase) : null;   // antes del descuento RN-09
  }
}

module.exports = Dispensacion;
