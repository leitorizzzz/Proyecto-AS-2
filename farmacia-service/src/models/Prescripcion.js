/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Prescripcion emitida en una visita medica. La tabla real
 * (visita_prescripciones) es propiedad de pacientes-service; farmacia-service
 * solo la lee para validar RN-06 antes de dispensar, y la marca como
 * 'dispensada' cuando lo hace.
 *
 * Estados posibles:
 *   - pendiente: emitida pero no dispensada aun
 *   - dispensada: ya se entrego al paciente, no se puede re-dispensar
 */
class Prescripcion {
  constructor({
    id,
    idVisita,
    idPaciente,
    idMedicamento,
    medicamento,
    dosis,
    indicaciones,
    estado,
    idDispensacion,
    fechaPrescripcion,
    fechaDispensacion
  }) {
    this.id = id;
    this.idVisita = idVisita;
    this.idPaciente = idPaciente;
    this.idMedicamento = idMedicamento;
    this.medicamento = medicamento;
    this.dosis = dosis || null;
    this.indicaciones = indicaciones || null;
    this.estado = estado || 'pendiente';
    this.idDispensacion = idDispensacion || null;
    this.fechaPrescripcion = fechaPrescripcion || null;
    this.fechaDispensacion = fechaDispensacion || null;
  }

  estaPendiente() { return this.estado === 'pendiente'; }
  estaDispensada() { return this.estado === 'dispensada'; }
}

Prescripcion.ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  DISPENSADA: 'dispensada'
});

module.exports = Prescripcion;
