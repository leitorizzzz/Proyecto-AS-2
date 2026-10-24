const AuditoriaService = require('../services/AuditoriaService');
const RecuperacionService = require('../services/RecuperacionService');

/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 */
class AuthController {
  constructor(authService, auditoriaService, recuperacionService = null) {
    this.service = authService;
    this.auditoria = auditoriaService;
    this.recuperacion = recuperacionService;
  }

  /** Auditoria de acciones sin sesion: el "usuario" es la cuenta afectada. */
  _auditarCuenta = (req, usuario, detalle) =>
    this.auditoria
      ? this.auditoria.registrar({ ...AuditoriaService.contextoDe(req, 'usuarios'), usuario: { sub: usuario.id, email: usuario.email } },
          'modificar', 'usuario', usuario.id, detalle)
      : null;

  /**
   * RF-42: siempre la misma respuesta, exista o no el correo. El trabajo
   * (token, correo, auditoria) sigue despues de responder, asi el tiempo de
   * respuesta tampoco revela si la cuenta existe.
   */
  recuperar = async (req, res) => {
    let email;
    try { email = RecuperacionService.validarEmail(req.body?.email); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    res.json({ mensaje: 'Si el correo pertenece a una cuenta activa, en unos minutos recibira un enlace para crear una nueva contrasena. El enlace vence en 30 minutos.' });
    try {
      const r = await this.recuperacion.solicitar(email);
      if (r.enviado) {
        await this._auditarCuenta(req, r.usuario,
          `recuperacion de contrasena solicitada (notificacion #${r.idNotificacion ?? '-'}, vence ${r.expira.toISOString()})`);
      }
    } catch (error) {
      console.warn(`[recuperacion] no se completo la solicitud: ${error.message}`);
    }
  };

  restablecer = async (req, res) => {
    try {
      const usuario = await this.recuperacion.restablecer(req.body || {});
      await this._auditarCuenta(req, usuario, 'contrasena restablecida con enlace de recuperacion');
      res.json({ mensaje: 'Contrasena actualizada. Ya puede iniciar sesion.' });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  /** Registra en auditoria (usuario, IP, modulo, antes/despues); nunca falla. */
  _auditar = (req, accion, entidad, idEntidad, detalle, antes = null, despues = null) =>
    this.auditoria
      ? this.auditoria.registrar(AuditoriaService.contextoDe(req, 'usuarios'),
          accion, entidad, idEntidad, detalle, { antes, despues })
      : null;

  register = async (req, res) => {
    try {
      const usuario = await this.service.registrar(req.body);
      await this._auditar(req, 'crear', 'usuario', usuario.id, `${usuario.email} (${usuario.rol})`, null, usuario);
      res.status(201).json(usuario);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };

  login = async (req, res) => {
    try {
      const resultado = await this.service.login(req.body);
      res.json(resultado);
    } catch (error) {
      // 401 credenciales invalidas; 403 cuenta desactivada
      res.status(error.status || 401).json({ error: error.message });
    }
  };

  listarUsuarios = async (req, res) => {
    try {
      const incluirInactivos = req.query.incluirInactivos === 'true';
      if (incluirInactivos && req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administracion puede ver cuentas desactivadas' });
      }
      res.json(await this.service.listarUsuarios({ rol: req.query.rol, incluirInactivos }));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  desactivarUsuario = async (req, res) => {
    try {
      const antes = await this.service.obtenerPerfil(Number(req.params.id)).catch(() => null);
      const u = await this.service.desactivarUsuario(Number(req.params.id), req.usuario.sub);
      await this._auditar(req, 'desactivar', 'usuario', u.id, u.email, antes, u);
      res.json(u);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  reactivarUsuario = async (req, res) => {
    try {
      const antes = await this.service.obtenerPerfil(Number(req.params.id)).catch(() => null);
      const u = await this.service.reactivarUsuario(Number(req.params.id));
      await this._auditar(req, 'reactivar', 'usuario', u.id, u.email, antes, u);
      res.json(u);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  cambiarPassword = async (req, res) => {
    try {
      const usuario = await this.service.cambiarPassword(req.usuario.sub, req.body || {});
      await this._auditar(req, 'modificar', 'usuario', usuario.id, 'contrasena cambiada por el propio usuario');
      res.json({ mensaje: 'Contraseña actualizada.' });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  me = async (req, res) => {
    try {
      const usuario = await this.service.obtenerPerfil(req.usuario.sub);
      res.json(usuario);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };
}

module.exports = AuthController;
