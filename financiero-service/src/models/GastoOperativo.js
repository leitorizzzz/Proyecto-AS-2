/**
 * Gasto operativo del asilo (servicios, mantenimiento, personal, etc.).
 */
class GastoOperativo {
  constructor({ id, concepto, monto, categoria, fecha }) {
    this.id = id || null;
    this.concepto = concepto;
    this.monto = Number(monto);
    this.categoria = categoria || 'otros';
    this.fecha = fecha || new Date().toISOString();
  }
}
GastoOperativo.CATEGORIAS = Object.freeze([
  'servicios', 'mantenimiento', 'personal', 'alimentacion', 'medicamentos', 'otros'
]);
module.exports = GastoOperativo;
