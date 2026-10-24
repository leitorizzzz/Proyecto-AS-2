/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Token de recuperacion de contrasena (RF-42, UC-10.4). En la base solo se
 * guarda su hash SHA-256: el token en claro viaja una sola vez, en el
 * correo. Vale 30 minutos y se usa una sola vez.
 */
class TokenRecuperacion {
  constructor({ id, idUsuario, tokenHash, expira, usado, fechaCreacion }) {
    this.id = id || null;
    this.idUsuario = idUsuario;
    this.tokenHash = tokenHash;
    this.expira = expira ? new Date(expira) : null;
    this.usado = usado ? new Date(usado) : null;
    this.fechaCreacion = fechaCreacion || null;
  }

  estaVigente(ahora = new Date()) {
    return !this.usado && Boolean(this.expira) && this.expira > ahora;
  }
}

module.exports = TokenRecuperacion;
