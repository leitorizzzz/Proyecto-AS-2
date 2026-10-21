/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 */
class AuthController {
  constructor(authService, auditoriaService) {
    this.service = authService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria; nunca falla (ver AuditoriaService). */
  _auditar = (req, accion, entidad, idEntidad, detalle) =>
    this.auditoria ? this.auditoria.registrar(req.usuario, accion, entidad, idEntidad, detalle) : null;

  register = async (req, res) => {
    try {
      const usuario = await this.service.registrar(req.body);
      await this._auditar(req, 'crear', 'usuario', usuario.id, `${usuario.email} (${usuario.rol})`);
      res.status(201).json(usuario);
    } catch (error) {
      res.status(400).json({ error: error.message });
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
      const u = await this.service.desactivarUsuario(Number(req.params.id), req.usuario.sub);
      await this._auditar(req, 'desactivar', 'usuario', u.id, u.email);
      res.json(u);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  reactivarUsuario = async (req, res) => {
    try {
      const u = await this.service.reactivarUsuario(Number(req.params.id));
      await this._auditar(req, 'reactivar', 'usuario', u.id, u.email);
      res.json(u);
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
