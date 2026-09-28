/**
 * CAPA DE ENTIDADES / MODELOS
 * Registro de envio de correo al familiar del paciente.
 */
class Notificacion {
  constructor({
    id, idPaciente, tipoEvento, destinatarioEmail, asunto, cuerpo,
    estado, fechaEnvio, mensajeError
  }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.tipoEvento = tipoEvento;
    this.destinatarioEmail = destinatarioEmail;
    this.asunto = asunto;
    this.cuerpo = cuerpo;
    this.estado = estado || 'pendiente';
    this.fechaEnvio = fechaEnvio || null;
    this.mensajeError = mensajeError || null;
  }
}

Notificacion.ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  ENVIADA: 'enviada',
  FALLIDA: 'fallida'
});

Notificacion.EVENTOS = Object.freeze({
  SOLICITUD_CREADA: 'solicitud_creada',
  CITA_ASIGNADA: 'cita_asignada',
  VISITA_COMPLETADA: 'visita_completada'
});

module.exports = Notificacion;
