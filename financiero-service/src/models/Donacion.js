/**
 * Donacion recibida por el asilo. El tipo distingue entre dinero,
 * bienes (comida, medicamentos, ropa) y otros.
 */
class Donacion {
  constructor({ id, idDonante, monto, tipo, concepto, fecha }) {
    this.id = id || null;
    this.idDonante = idDonante;
    this.monto = Number(monto);
    this.tipo = tipo || 'dinero';
    this.concepto = concepto || null;
    this.fecha = fecha || new Date().toISOString();
  }
}
Donacion.TIPOS = Object.freeze(['dinero', 'bienes', 'otro']);
module.exports = Donacion;
