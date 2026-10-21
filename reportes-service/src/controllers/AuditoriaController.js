/**
 * CAPA DE PRESENTACION (API REST) — GET /api/auditoria
 */
class AuditoriaController {
  constructor(auditoriaService) {
    this.service = auditoriaService;
  }

  listar = async (req, res) => {
    try {
      const { desde, hasta, entidad, idEntidad, limite } = req.query;
      res.json(await this.service.listar({ desde, hasta, entidad, idEntidad, limite }));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  };
}

module.exports = AuditoriaController;
