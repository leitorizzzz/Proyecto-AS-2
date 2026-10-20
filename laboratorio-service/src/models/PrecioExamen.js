/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Precio base de un tipo de examen (tabla examenes_precios). El costo que
 * paga el residente se calcula aplicando el descuento de fundacion (RN-09)
 * sobre precioBase; ese calculo vive en LaboratorioService, no aqui.
 */
class PrecioExamen {
  constructor({ id, tipo, precioBase }) {
    this.id = id || null;
    this.tipo = tipo;
    this.precioBase = precioBase != null ? Number(precioBase) : null;
  }
}

module.exports = PrecioExamen;
