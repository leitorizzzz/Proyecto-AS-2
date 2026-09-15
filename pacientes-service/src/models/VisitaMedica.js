/**
 * CAPA DE ENTIDADES / MODELOS
 * Visita medica generada a partir de una solicitud de referencia
 * cuando el medico especialista recibe al paciente.
 *
 * Contiene diagnostico, observaciones, examenes solicitados (registro
 * local, la conexion a laboratorio-service se implementara despues)
 * y prescripciones (registro local, la conexion a farmacia-service
 * se implementara despues).
 */
class VisitaMedica {
  constructor({
    id,
    idSolicitudReferencia,
    idPaciente,
    idMedicoEspecialista,
    fecha,
    diagnostico,
    observaciones,
    estado,
    fechaCompletada
  }) {
    this.id = id || null;
    this.idSolicitudReferencia = idSolicitudReferencia;
    this.idPaciente = idPaciente;
    this.idMedicoEspecialista = idMedicoEspecialista;
    this.fecha = fecha || new Date().toISOString();
    this.diagnostico = diagnostico || null;
    this.observaciones = observaciones || null;
    this.estado = estado || 'en_atencion';
    this.fechaCompletada = fechaCompletada || null;
    this.examenes = [];         // se llena desde el service al leer
    this.prescripciones = [];   // se llena desde el service al leer
  }
}

VisitaMedica.ESTADOS = Object.freeze({
  EN_ATENCION: 'en_atencion',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada'
});

module.exports = VisitaMedica;
