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
    fechaDispensacion,
    pacienteActivo,
    cantidadPrescrita,
    cantidadEntregada,
    estadoVisita
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
    // Leido de pacientes.activo (BD compartida): un paciente desactivado
    // no puede recibir dispensaciones.
    this.pacienteActivo = pacienteActivo === undefined || pacienteActivo === null ? true : Boolean(pacienteActivo);
    // Despacho parcial: null = prescripcion anterior sin cantidad (se
    // despacha completa en una sola entrega).
    this.cantidadPrescrita = cantidadPrescrita != null ? Number(cantidadPrescrita) : null;
    this.cantidadEntregada = Number(cantidadEntregada || 0);
    this.cantidadRestante = this.cantidadPrescrita != null ? this.cantidadPrescrita - this.cantidadEntregada : null;
    this.estadoVisita = estadoVisita || null;
  }

  /** Puede recibir una entrega (RN-06): pendiente o parcialmente despachada. */
  admiteDespacho() { return this.estado === 'pendiente' || this.estado === 'parcial'; }
  estaPendiente() { return this.estado === 'pendiente'; }
  estaDispensada() { return this.estado === 'dispensada'; }
}

Prescripcion.ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  PARCIAL: 'parcial',
  DISPENSADA: 'dispensada'
});

module.exports = Prescripcion;
