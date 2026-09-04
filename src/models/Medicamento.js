/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa un medicamento del inventario de farmacia.
 * No contiene logica de negocio ni acceso a base de datos.
 */
class Medicamento {
  constructor({ id, nombre, presentacion, stock, precioUnitario }) {
    this.id = id || null;
    this.nombre = nombre;
    this.presentacion = presentacion;   // ej: "tableta 500mg", "jarabe 120ml"
    this.stock = stock;
    this.precioUnitario = precioUnitario;
  }

  getNombre() { return this.nombre; }
  getStock() { return this.stock; }
  getPrecioUnitario() { return this.precioUnitario; }

  tieneStockSuficiente(cantidad) {
    return this.stock >= cantidad;
  }
}

module.exports = Medicamento;
