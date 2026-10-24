const jwt = require('jsonwebtoken');

/**
 * Cliente HTTP hacia notificaciones-service para el correo de recuperacion
 * de contrasena. Quien pide la recuperacion no tiene sesion, asi que
 * auth-service firma un JWT de servicio de 1 minuto con rol 'sistema' (no
 * es un rol de usuario: nadie puede iniciar sesion con el). Los errores se
 * registran en consola y no se propagan.
 */
class NotificacionesClient {
  constructor({ baseUrl = process.env.NOTIFICACIONES_URL, jwtSecret = process.env.JWT_SECRET } = {}) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.jwtSecret = jwtSecret;
  }

  _tokenServicio() {
    return jwt.sign({ sub: 0, email: 'auth-service', rol: 'sistema' }, this.jwtSecret, { expiresIn: '1m' });
  }

  async enviarRecuperacion({ email, nombre, enlace, minutos }) {
    if (!this.baseUrl) {
      console.warn('[recuperacion] NOTIFICACIONES_URL no configurada: no se envia el correo');
      return null;
    }
    try {
      const resp = await fetch(`${this.baseUrl}/api/notificaciones/recuperacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._tokenServicio()}` },
        body: JSON.stringify({ email, nombre, enlace, minutos })
      });
      if (!resp.ok) {
        console.warn(`[recuperacion] notificaciones respondio ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        return null;
      }
      return await resp.json();
    } catch (err) {
      console.warn(`[recuperacion] error de red: ${err.message}`);
      return null;
    }
  }
}

module.exports = NotificacionesClient;
