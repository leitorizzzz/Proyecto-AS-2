/**
 * Cliente HTTP hacia notificaciones-service.
 *
 * Vive en la capa de servicios porque encapsula un side-effect del
 * dominio: al crear una solicitud se debe avisar al familiar. El fallo
 * de este envio NO debe bloquear la creacion de la solicitud, por eso
 * se llama en modo fire-and-forget desde SolicitudService.
 */
class NotificacionesClient {
  constructor({ baseUrl }) {
    this.baseUrl = (baseUrl || process.env.NOTIFICACIONES_URL || '').replace(/\/$/, '');
  }

  /**
   * Envia el correo de "solicitud creada" al familiar del paciente.
   * Silencia errores (logea a consola) para no bloquear el flujo.
   */
  async enviarSolicitud({ paciente, especialidad, motivo }, authHeader) {
    if (!this.baseUrl) return;                       // deshabilitado
    if (!paciente || !paciente.familiarEmail) return; // sin destinatario

    const url = `${this.baseUrl}/api/notificaciones/solicitud`;
    const payload = {
      idPaciente: paciente.id,
      pacienteNombre: `${paciente.nombres} ${paciente.apellidos}`.trim(),
      especialidad,
      motivo,
      familiarEmail: paciente.familiarEmail
    };
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const t = await resp.text();
        console.warn(`[notificaciones] fallo ${resp.status}: ${t.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn(`[notificaciones] error de red: ${err.message}`);
    }
  }
}

module.exports = NotificacionesClient;
