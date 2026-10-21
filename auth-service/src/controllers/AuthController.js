/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 */
class AuthController {
  constructor(authService) {
    this.service = authService;
  }

  register = async (req, res) => {
    try {
      const usuario = await this.service.registrar(req.body);
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
      res.json(await this.service.desactivarUsuario(Number(req.params.id), req.usuario.sub));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };

  reactivarUsuario = async (req, res) => {
    try {
      res.json(await this.service.reactivarUsuario(Number(req.params.id)));
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
