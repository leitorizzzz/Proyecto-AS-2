/**
 * Cargo por un servicio prestado a un paciente. Lo cobra la cuenta del
 * familiar responsable (idFamiliar). Origen:
 *   - manual: registrado por administracion;
 *   - visita: generado al cerrar la visita medica (consulta + laboratorio +
 *     farmacia, con detalles en cargos_detalle);
 *   - dispensacion: medicamento entregado despues de cerrada la visita.
 * saldo = monto - montoPagado (los abonos nunca lo dejan negativo).
 */
class CargoServicio {
  constructor({ id, idPaciente, concepto, monto, fecha, estado, idVisita, idDispensacion,
                idFamiliar, origen, montoPagado, detalles }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.concepto = concepto;
    this.monto = Number(monto);
    this.fecha = fecha || new Date().toISOString();
    this.estado = estado || 'pendiente';
    this.idVisita = idVisita ?? null;
    this.idDispensacion = idDispensacion ?? null;
    this.idFamiliar = idFamiliar ?? null;
    this.origen = origen || 'manual';
    this.montoPagado = Number(montoPagado || 0);
    this.saldo = this.estado === 'pagado' ? 0 : Math.round((this.monto - this.montoPagado) * 100) / 100;
    this.detalles = detalles || [];
  }
}
CargoServicio.ESTADOS = Object.freeze({ PENDIENTE: 'pendiente', PARCIAL: 'parcial', PAGADO: 'pagado' });
CargoServicio.ORIGENES = Object.freeze(['manual', 'visita', 'dispensacion']);
module.exports = CargoServicio;
