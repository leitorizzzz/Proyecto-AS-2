/**
 * CAPA DE ENTIDADES / MODELOS
 * Solicitud de referencia a medico especialista, generada por el
 * medico general durante el primer contacto con el paciente.
 *
 * Ciclo de vida:
 *   pendiente_asignacion -> cita_asignada -> en_atencion -> completada
 *                        \_______________ cancelada _______________/
 */
class SolicitudReferencia {
  constructor({
    id,
    idPaciente,
    idMedicoGeneral,
    especialidad,
    motivo,
    estado,
    fechaCita,
    horaCita,
    idMedicoEspecialista,
    fechaCreacion,
    fechaActualizacion
  }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.idMedicoGeneral = idMedicoGeneral;
    this.especialidad = especialidad;
    this.motivo = motivo;
    this.estado = estado || 'pendiente_asignacion';
    this.fechaCita = fechaCita || null;
    this.horaCita = horaCita || null;
    this.idMedicoEspecialista = idMedicoEspecialista || null;
    this.fechaCreacion = fechaCreacion || new Date().toISOString();
    this.fechaActualizacion = fechaActualizacion || this.fechaCreacion;
  }
}

SolicitudReferencia.ESTADOS = Object.freeze({
  PENDIENTE_ASIGNACION: 'pendiente_asignacion',
  CITA_ASIGNADA: 'cita_asignada',
  EN_ATENCION: 'en_atencion',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada'
});

SolicitudReferencia.ESTADOS_ACTIVOS = Object.freeze([
  SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION,
  SolicitudReferencia.ESTADOS.CITA_ASIGNADA,
  SolicitudReferencia.ESTADOS.EN_ATENCION
]);

module.exports = SolicitudReferencia;
