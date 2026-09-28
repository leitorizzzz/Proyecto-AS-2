/**
 * Pago que el asilo realiza a la fundacion en contraprestacion por
 * los servicios (medicos, laboratorio, farmacia con descuento).
 */
class PagoFundacion {
  constructor({ id, monto, concepto, fecha }) {
    this.id = id || null;
    this.monto = Number(monto);
    this.concepto = concepto;
    this.fecha = fecha || new Date().toISOString();
  }
}
module.exports = PagoFundacion;
