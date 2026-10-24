const crypto = require('crypto');
const { validarPassword } = require('./reglasPassword');

/**
 * CAPA DE LOGICA DE NEGOCIO — recuperacion de contrasena (RF-42, UC-10.4).
 *
 * solicitar(email): si la cuenta existe y esta activa, genera un token
 *   aleatorio de 256 bits, guarda solo su hash SHA-256 (vence en
 *   RECUPERACION_MINUTOS, 30 por defecto; invalida los anteriores) y manda el
 *   enlace por notificaciones-service. Quien llama responde lo mismo exista o
 *   no el correo (el controlador no espera este resultado).
 * restablecer(token, password): valida la contrasena con la misma regla del
 *   alta, comprueba el token y lo consume en la misma transaccion que cambia
 *   la contrasena (un solo uso).
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const enlaceInvalido = () =>
  Object.assign(new Error('El enlace de recuperacion no es valido o ya vencio. Solicite uno nuevo.'), { status: 400 });

class RecuperacionService {
  constructor(usuarioRepo, tokenRepo, hasher, notificaciones, {
    minutos = Number(process.env.RECUPERACION_MINUTOS || 30),
    urlBase = process.env.RECUPERACION_URL_BASE || 'http://localhost:8090'
  } = {}) {
    this.usuarioRepo = usuarioRepo;
    this.tokenRepo = tokenRepo;
    this.hasher = hasher;
    this.notificaciones = notificaciones;
    this.minutos = minutos;
    this.urlBase = urlBase.replace(/\/$/, '');
  }

  static validarEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(e)) throw Object.assign(new Error('Escriba un correo valido'), { status: 400 });
    return e;
  }

  /** Devuelve { enviado, usuario } para auditar; el cliente nunca lo ve. */
  async solicitar(email) {
    const usuario = await this.usuarioRepo.obtenerPorEmail(RecuperacionService.validarEmail(email));
    if (!usuario || usuario.activo === false) return { enviado: false, usuario: null };

    const token = crypto.randomBytes(32).toString('base64url');
    const expira = new Date(Date.now() + this.minutos * 60 * 1000);
    await this.tokenRepo.guardar(usuario.id, hashToken(token), expira);
    // El token va en el fragmento (#): el navegador no lo manda al servidor.
    const enlace = `${this.urlBase}/#restablecer=${token}`;
    const notificacion = await this.notificaciones.enviarRecuperacion({
      email: usuario.email, nombre: usuario.nombre, enlace, minutos: this.minutos
    });
    return { enviado: true, usuario: usuario.toPublic(), idNotificacion: notificacion?.id ?? null, expira };
  }

  async restablecer({ token, password } = {}) {
    if (!TOKEN_REGEX.test(String(token || ''))) throw enlaceInvalido();
    validarPassword(password);
    const tokenHash = hashToken(token);
    // Se comprueba antes de calcular bcrypt para no gastar CPU en tokens falsos.
    if (!await this.tokenRepo.obtenerVigente(tokenHash)) throw enlaceInvalido();
    const passwordHash = await this.hasher.hash(password, 10);
    const idUsuario = await this.tokenRepo.consumir(tokenHash, passwordHash);
    if (!idUsuario) throw enlaceInvalido();
    const usuario = await this.usuarioRepo.obtenerPorId(idUsuario);
    return usuario.toPublic();
  }
}

RecuperacionService.hashToken = hashToken;
module.exports = RecuperacionService;
