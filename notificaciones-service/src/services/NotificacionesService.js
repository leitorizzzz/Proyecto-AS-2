const Notificacion = require('../models/Notificacion');

/**
 * CAPA DE LOGICA DE NEGOCIO
 *
 * Compone, persiste y envia notificaciones. Maneja reintentos con espera
 * creciente: cada intento fallido duplica el delay base hasta llegar al
 * maximo. Alcanzado el maxIntentos, la notificacion queda en estado
 * 'fallida_definitiva' sin bucle infinito.
 *
 * En MODO_SIMULACION=true no se llama a Brevo: la notificacion se marca
 * como enviada en el primer intento (util para dev / CI).
 */
class NotificacionesService {
  constructor(repo) {
    this.repo = repo;
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.apiUrl = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
    this.remitenteEmail = process.env.REMITENTE_EMAIL || 'noreply@asilo.gt';
    this.remitenteNombre = process.env.REMITENTE_NOMBRE || 'Asilo Cabeza de Algodon';
    this.simulacion = String(process.env.MODO_SIMULACION).toLowerCase() === 'true';

    this.maxIntentos = Math.max(1, Number(process.env.NOTIF_MAX_INTENTOS || 3));
    this.esperaBaseSeg = Math.max(5, Number(process.env.NOTIF_ESPERA_BASE_SEG || 30));
    this.esperaMaxSeg = Math.max(this.esperaBaseSeg,
                                 Number(process.env.NOTIF_ESPERA_MAX_SEG || 300));
  }

  async enviarCorreoSolicitud({ idPaciente, pacienteNombre, especialidad, motivo, familiarEmail }) {
    if (!familiarEmail) {
      throw Object.assign(new Error('familiarEmail es requerido'), { status: 400 });
    }
    const asunto = `Se ha registrado una solicitud medica para ${pacienteNombre}`;
    const cuerpo = this._plantillaSolicitud({ pacienteNombre, especialidad, motivo });
    return this._crearYEnviar({
      idPaciente,
      tipoEvento: Notificacion.EVENTOS.SOLICITUD_CREADA,
      destinatarioEmail: familiarEmail,
      asunto,
      cuerpo
    });
  }

  async _crearYEnviar(datos) {
    const notif = await this.repo.guardar(new Notificacion({
      ...datos,
      estado: Notificacion.ESTADOS.PENDIENTE,
      maxIntentos: this.maxIntentos
    }));
    return this.intentarEnvio(notif);
  }

  /**
   * Intenta enviar una notificacion. En caso de fallo, calcula el proximo
   * intento o la marca como definitivamente fallida si agoto los reintentos.
   */
  async intentarEnvio(notif) {
    const intentos = notif.intentos + 1;

    if (this.simulacion || !this.apiKey) {
      await this.repo.marcarEnviada(notif.id, intentos);
      return { ...notif, estado: Notificacion.ESTADOS.ENVIADA, intentos };
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
          to: [{ email: notif.destinatarioEmail }],
          subject: notif.asunto,
          htmlContent: notif.cuerpo
        })
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Brevo respondio ${resp.status}: ${text.slice(0, 300)}`);
      }
      await this.repo.marcarEnviada(notif.id, intentos);
      return { ...notif, estado: Notificacion.ESTADOS.ENVIADA, intentos };
    } catch (err) {
      const mensaje = err.message || 'Error desconocido';
      if (intentos >= notif.maxIntentos) {
        await this.repo.marcarFalloDefinitivo(notif.id, intentos, mensaje);
        return { ...notif, estado: Notificacion.ESTADOS.FALLIDA_DEFINITIVA, intentos, mensajeError: mensaje };
      }
      const proximo = this._calcularProximoIntento(intentos);
      await this.repo.marcarFalloConReintento(notif.id, intentos, proximo, mensaje);
      return { ...notif, estado: Notificacion.ESTADOS.FALLIDA, intentos, mensajeError: mensaje };
    }
  }

  /**
   * Espera exponencial: base * 2^(intentos-1), con tope en esperaMaxSeg.
   * Ej. base=30s -> 30, 60, 120, 240, ...
   */
  _calcularProximoIntento(intentos) {
    const seg = Math.min(
      this.esperaBaseSeg * Math.pow(2, intentos - 1),
      this.esperaMaxSeg
    );
    return new Date(Date.now() + seg * 1000);
  }

  /** Un ciclo del job de reintentos. Devuelve cuantas intento. */
  async procesarReintentosPendientes({ lote = 20 } = {}) {
    const listas = await this.repo.listarListasParaReintento(lote);
    for (const n of listas) {
      // eslint-disable-next-line no-await-in-loop
      await this.intentarEnvio(n);
    }
    return listas.length;
  }

  /** Reintento manual forzado (lo lanza el admin desde el UI). */
  async reintentarManual(id) {
    const notif = await this.repo.obtenerPorId(id);
    if (!notif) throw Object.assign(new Error('Notificacion no encontrada'), { status: 404 });
    if (notif.estado === Notificacion.ESTADOS.ENVIADA) {
      throw Object.assign(new Error('La notificacion ya fue enviada'), { status: 409 });
    }
    // Si estaba definitivamente fallida, un reintento manual la vuelve
    // a dejar en el ciclo con sus intentos reseteados a 0.
    if (notif.estado === Notificacion.ESTADOS.FALLIDA_DEFINITIVA) {
      notif.intentos = 0;
    }
    return this.intentarEnvio(notif);
  }

  logNotificaciones(filtros) {
    return this.repo.listar(filtros);
  }

  obtenerPorId(id) { return this.repo.obtenerPorId(id); }

  _plantillaSolicitud({ pacienteNombre, especialidad, motivo }) {
    return `<!doctype html>
<html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f7fb;padding:32px;color:#15202b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7dde6;padding:32px">
    <p style="font-size:12px;letter-spacing:0.08em;color:#4b6075;margin:0 0 24px 0">
      Asilo Cabeza de Algodon &middot; Aviso a familiares
    </p>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 16px 0;font-weight:600">
      Se registro una solicitud medica para su familiar
    </h1>
    <p style="line-height:1.55">Estimada familia,</p>
    <p style="line-height:1.55">
      Le informamos que el equipo medico ha creado una solicitud de atencion
      especializada para <strong>${pacienteNombre}</strong>.
    </p>
    <table style="border-collapse:collapse;margin:20px 0;font-size:15px;line-height:1.6">
      <tr><td style="padding:4px 16px 4px 0;color:#4b6075">Especialidad</td>
          <td style="padding:4px 0">${especialidad}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#4b6075;vertical-align:top">Motivo</td>
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
