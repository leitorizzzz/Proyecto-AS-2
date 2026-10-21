/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Cargo que se genera al cerrar una visita medica: consulta del
 * especialista + examenes de laboratorio + medicamentos dispensados,
 * cada linea con el descuento de la fundacion (RN-09) ya aplicado. Se
 * guarda en cargos_servicio / cargos_detalle (tablas de financiero-service,
 * misma BD) dentro de la misma transaccion que cierra la visita.
 */
class CargoVisita {
  constructor({ id, idPaciente, idVisita, idFamiliar, concepto, monto, detalles }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.idVisita = idVisita;
    this.idFamiliar = idFamiliar != null ? Number(idFamiliar) : null;
    this.concepto = concepto;
    this.monto = Number(monto);
    this.detalles = detalles || [];   // [{ rubro, descripcion, idReferencia, montoBase, descuento, monto }]
  }

  totalPorRubro(rubro) {
    return Math.round(this.detalles.filter(d => d.rubro === rubro)
      .reduce((acc, d) => acc + Number(d.monto), 0) * 100) / 100;
  }
}

CargoVisita.RUBROS = Object.freeze(['consulta', 'laboratorio', 'farmacia']);
CargoVisita.TARIFA_CONSULTA = 'consulta_especialista';

module.exports = CargoVisita;
