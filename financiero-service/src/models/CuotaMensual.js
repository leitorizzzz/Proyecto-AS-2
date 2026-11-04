/**
 * Cuota mensual que debe pagar el familiar del paciente por su
 * estancia en el asilo. Una por (paciente, mes, anio).
 */
class CuotaMensual {
  constructor({ id, idPaciente, mes, anio, monto, estado, fechaPago, fechaVencimiento }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.mes = Number(mes);
    this.anio = Number(anio);
    this.monto = Number(monto);
    this.estado = estado || 'pendiente';
    this.fechaPago = fechaPago || null;
    // Caso 21: desde el dia siguiente a esta fecha la cuota pendiente esta vencida.
    this.fechaVencimiento = fechaVencimiento instanceof Date
      ? fechaVencimiento.toISOString().slice(0, 10)
      : (fechaVencimiento ? String(fechaVencimiento).slice(0, 10) : null);
  }
}
// Caso 21: 'vencida' = pendiente cuya fecha de vencimiento ya paso (se
// marca al consultar y con un proceso periodico); al pagarse pasa a 'pagada'.
CuotaMensual.ESTADOS = Object.freeze({ PENDIENTE: 'pendiente', VENCIDA: 'vencida', PAGADA: 'pagada' });
CuotaMensual.POR_COBRAR = Object.freeze(['pendiente', 'vencida']);
module.exports = CuotaMensual;
