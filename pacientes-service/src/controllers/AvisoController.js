/**
 * CAPA DE PRESENTACION (API REST) — /api/avisos
 */
class AvisoController {
  constructor(avisoService) {
    this.service = avisoService;
  }

  listar = async (req, res) => {
    try {
      res.json(await this.service.listarMios(req.usuario.sub, { soloNoLeidos: req.query.noLeidos === 'true' }));
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };

  marcarLeido = async (req, res) => {
    try {
      res.json(await this.service.marcarLeido(req.params.id, req.usuario.sub));
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  };
}

module.exports = AvisoController;
