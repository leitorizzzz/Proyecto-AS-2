/**
 * CAPA DE ENTIDADES / MODELOS
 * Registro de envio de correo al familiar del paciente.
 *
 * Estados:
 *   pendiente           - creada, aun no se intento enviar
 *   enviada             - entregada al proveedor con exito
 *   fallida             - fallo pero quedan reintentos
 *   fallida_definitiva  - agoto el maximo de intentos
 */
class Notificacion {
  constructor({
    id, idPaciente, tipoEvento, destinatarioEmail, asunto, cuerpo,
    estado,
    intentos, maxIntentos,
    proximoIntento, fechaCreacion, fechaEnvio, fechaUltimoIntento,
    mensajeError
  }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.tipoEvento = tipoEvento;
    this.destinatarioEmail = destinatarioEmail;
    this.asunto = asunto;
    this.cuerpo = cuerpo;
    this.estado = estado || Notificacion.ESTADOS.PENDIENTE;
    this.intentos = intentos == null ? 0 : Number(intentos);
    this.maxIntentos = maxIntentos == null ? 3 : Number(maxIntentos);
    this.proximoIntento = proximoIntento || null;
    this.fechaCreacion = fechaCreacion || null;
    this.fechaEnvio = fechaEnvio || null;
    this.fechaUltimoIntento = fechaUltimoIntento || null;
    this.mensajeError = mensajeError || null;
  }
}

Notificacion.ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  ENVIADA: 'enviada',
  FALLIDA: 'fallida',
  FALLIDA_DEFINITIVA: 'fallida_definitiva'
});

Notificacion.EVENTOS = Object.freeze({
  SOLICITUD_CREADA: 'solicitud_creada',
  CITA_ASIGNADA: 'cita_asignada',
  VISITA_COMPLETADA: 'visita_completada'
});

module.exports = Notificacion;
