/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Notificacion interna para un usuario del sistema (caso 12): por ejemplo,
 * al medico general y al enfermero de una solicitud cuando se les asigna
 * la cita. No es el correo al familiar (eso es notificaciones-service).
 */
class Aviso {
  constructor({ id, idUsuario, tipo, mensaje, idSolicitud, leido, fecha }) {
    this.id = id || null;
    this.idUsuario = idUsuario;
    this.tipo = tipo;
    this.mensaje = mensaje;
    this.idSolicitud = idSolicitud ?? null;
    this.leido = Boolean(leido);
    this.fecha = fecha || null;
  }
}
Aviso.TIPOS = Object.freeze({ CITA_ASIGNADA: 'cita_asignada' });
module.exports = Aviso;
