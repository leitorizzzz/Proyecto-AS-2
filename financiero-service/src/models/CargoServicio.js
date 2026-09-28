/**
 * Cargo por un servicio prestado a un paciente (visita, examen,
 * medicamento). Genera saldo pendiente hasta que sea pagado.
 */
class CargoServicio {
  constructor({ id, idPaciente, concepto, monto, fecha, estado }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.concepto = concepto;
    this.monto = Number(monto);
    this.fecha = fecha || new Date().toISOString();
    this.estado = estado || 'pendiente';
  }
}
CargoServicio.ESTADOS = Object.freeze({ PENDIENTE: 'pendiente', PAGADO: 'pagado' });
module.exports = CargoServicio;
