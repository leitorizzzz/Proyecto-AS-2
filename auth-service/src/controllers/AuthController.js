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
      res.status(401).json({ error: error.message });
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
