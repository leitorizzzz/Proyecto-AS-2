const Notificacion = require('../models/Notificacion');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Compone el correo (asunto + cuerpo HTML), lo persiste como notificacion
 * y lo envia via Brevo. Si BREVO_API_KEY esta vacio o MODO_SIMULACION=true,
 * la envia como 'enviada' sin llamar al proveedor (para desarrollo).
 */
class NotificacionesService {
  constructor(repo) {
    this.repo = repo;
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.apiUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
    this.remitenteEmail = process.env.REMITENTE_EMAIL || 'noreply@asilo.gt';
    this.remitenteNombre = process.env.REMITENTE_NOMBRE || 'Asilo Cabeza de Algodon';
    this.simulacion = String(process.env.MODO_SIMULACION).toLowerCase() === 'true';
  }

  async enviarCorreoSolicitud({ idPaciente, pacienteNombre, especialidad, motivo, familiarEmail }) {
    if (!familiarEmail) {
      throw Object.assign(new Error('familiarEmail es requerido'), { status: 400 });
    }
    const asunto = `Se ha registrado una solicitud medica para ${pacienteNombre}`;
    const cuerpo = this._plantillaSolicitud({ pacienteNombre, especialidad, motivo });
    return this.registrarEnvio({
      idPaciente,
      tipoEvento: Notificacion.EVENTOS.SOLICITUD_CREADA,
      destinatarioEmail: familiarEmail,
      asunto,
      cuerpo
    });
  }

  async registrarEnvio({ idPaciente, tipoEvento, destinatarioEmail, asunto, cuerpo }) {
    const notif = await this.repo.guardar(new Notificacion({
      idPaciente,
      tipoEvento,
      destinatarioEmail,
      asunto,
      cuerpo,
      estado: Notificacion.ESTADOS.PENDIENTE
    }));

    if (this.simulacion || !this.apiKey) {
      await this.repo.marcarEnviada(notif.id);
      notif.estado = Notificacion.ESTADOS.ENVIADA;
      notif.fechaEnvio = new Date().toISOString();
      return notif;
    }

    try {
      const resp = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          'accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: this.remitenteNombre, email: this.remitenteEmail },
          to: [{ email: destinatarioEmail }],
          subject: asunto,
          htmlContent: cuerpo
        })
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Brevo respondio ${resp.status}: ${text.slice(0, 300)}`);
      }
      await this.repo.marcarEnviada(notif.id);
      notif.estado = Notificacion.ESTADOS.ENVIADA;
      return notif;
    } catch (err) {
      await this.repo.marcarFallida(notif.id, err.message);
      notif.estado = Notificacion.ESTADOS.FALLIDA;
      notif.mensajeError = err.message;
      return notif;
    }
  }

  logNotificaciones(filtros) {
    return this.repo.listar(filtros);
  }

  _plantillaSolicitud({ pacienteNombre, especialidad, motivo }) {
    return `<!doctype html>
<html><body style="font-family:Georgia,serif;background:#f7f4ef;padding:32px;color:#1e1a17">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6dfd6;padding:32px">
    <p style="font-size:12px;letter-spacing:0.08em;color:#8a7a68;margin:0 0 24px 0">
      Asilo Cabeza de Algodon &middot; Aviso a familiares
    </p>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 16px 0;font-weight:500">
      Se registro una solicitud medica para su familiar
    </h1>
    <p style="line-height:1.55">Estimada familia,</p>
    <p style="line-height:1.55">
      Le informamos que el equipo medico ha creado una solicitud de atencion
      especializada para <strong>${pacienteNombre}</strong>.
    </p>
    <table style="border-collapse:collapse;margin:20px 0;font-size:15px;line-height:1.6">
      <tr><td style="padding:4px 16px 4px 0;color:#8a7a68">Especialidad</td>
          <td style="padding:4px 0">${especialidad}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#8a7a68;vertical-align:top">Motivo</td>
          <td style="padding:4px 0">${motivo}</td></tr>
    </table>
    <p style="line-height:1.55">
      La fundacion asignara pronto un medico especialista y una fecha de cita.
      Sera contactado nuevamente cuando la cita este confirmada.
    </p>
    <p style="line-height:1.55;margin-top:24px">Con atento saludo,<br/>Personal del asilo</p>
  </div>
</body></html>`;
  }
}

module.exports = NotificacionesService;
