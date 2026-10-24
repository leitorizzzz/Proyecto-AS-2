/**
 * CAPA DE LOGICA DE NEGOCIO — limite de intentos (login y /recuperar).
 *
 * Como maximo `maximo` intentos fallidos por (accion, IP, usuario) dentro
 * de una ventana de `ventanaMs` (5 en 15 minutos por defecto). La IP es
 * req.ip, ya resuelta por 'trust proxy' (IP real detras del nginx). Vive en
 * memoria del proceso: se reinicia si se reinicia auth-service y no se
 * comparte entre replicas (hay una sola).
 *
 * Ventana fija por clave: el primer fallo abre la ventana; al vencer, el
 * contador vuelve a cero. Un login correcto borra la clave.
 */
class LimitadorIntentos {
  constructor({
    maximo = Number(process.env.LIMITE_INTENTOS || 5),
    ventanaMs = Number(process.env.LIMITE_VENTANA_MIN || 15) * 60 * 1000,
    maxClaves = 50000,
    ahora = () => Date.now()
  } = {}) {
    this.maximo = maximo;
    this.ventanaMs = ventanaMs;
    this.maxClaves = maxClaves;
    this.ahora = ahora;
    this.registros = new Map(); // clave -> { fallos, desde }
    // Limpieza periodica de ventanas vencidas (no impide que el proceso termine).
    this._limpieza = setInterval(() => this.limpiar(), Math.min(this.ventanaMs, 60 * 1000));
    this._limpieza.unref?.();
  }

  static clave(accion, ip, usuario) {
    const ipNormal = String(ip || 'sin-ip').replace(/^::ffff:/, '');
    return `${accion}|${ipNormal}|${String(usuario || '').trim().toLowerCase()}`;
  }

  _vigente(clave) {
    const r = this.registros.get(clave);
    if (!r) return null;
    if (this.ahora() - r.desde >= this.ventanaMs) { this.registros.delete(clave); return null; }
    return r;
  }

  /** null si puede intentar; si no, { segundos } que faltan para reintentar. */
  bloqueo(clave) {
    const r = this._vigente(clave);
    if (!r || r.fallos < this.maximo) return null;
    return { segundos: Math.max(1, Math.ceil((r.desde + this.ventanaMs - this.ahora()) / 1000)) };
  }

  registrarFallo(clave) {
    const r = this._vigente(clave);
    if (r) { r.fallos += 1; return r.fallos; }
    if (this.registros.size >= this.maxClaves) this.limpiar();
    if (this.registros.size >= this.maxClaves) {
      // Tope de memoria: se descarta la clave mas vieja (orden de insercion del Map).
      this.registros.delete(this.registros.keys().next().value);
    }
    this.registros.set(clave, { fallos: 1, desde: this.ahora() });
    return 1;
  }

  reiniciar(clave) { this.registros.delete(clave); }

  limpiar() {
    const t = this.ahora();
    for (const [k, r] of this.registros) if (t - r.desde >= this.ventanaMs) this.registros.delete(k);
  }

  static mensaje(segundos) {
    const minutos = Math.ceil(segundos / 60);
    return `Demasiados intentos. Por seguridad, espere ${minutos} minuto${minutos === 1 ? '' : 's'} antes de volver a intentarlo.`;
  }
}

module.exports = LimitadorIntentos;
