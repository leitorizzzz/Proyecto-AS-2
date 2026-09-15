/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce HTTP <-> VisitaMedicaService.
 */
class VisitaMedicaController {
  constructor(visitaService) {
    this.service = visitaService;
  }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  obtener = async (req, res) => {
    try {
      const visita = await this.service.obtener(Number(req.params.id));
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  listarPorPaciente = async (req, res) => {
    try {
      const visitas = await this.service.obtenerPorPaciente(Number(req.params.idPaciente));
      res.json(visitas);
    } catch (error) { this._fallo(res, error); }
  };

  /** POST /api/solicitudes/:id/convertir-a-visita */
  convertirDesdeSolicitud = async (req, res) => {
    try {
      const idMedicoEspecialista = Number(req.usuario.sub);
      const visita = await this.service.convertirDesdeSolicitud(
        Number(req.params.id),
        idMedicoEspecialista
      );
      res.status(201).json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  actualizarClinico = async (req, res) => {
    try {
      const visita = await this.service.actualizarClinico(Number(req.params.id), req.body);
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  agregarExamen = async (req, res) => {
    try {
      const examen = await this.service.agregarExamen(Number(req.params.id), req.body);
      res.status(201).json(examen);
    } catch (error) { this._fallo(res, error); }
  };

  agregarPrescripcion = async (req, res) => {
    try {
      const rx = await this.service.agregarPrescripcion(Number(req.params.id), req.body);
      res.status(201).json(rx);
    } catch (error) { this._fallo(res, error); }
  };

  completar = async (req, res) => {
    try {
      const visita = await this.service.completar(Number(req.params.id));
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = VisitaMedicaController;
