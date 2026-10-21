/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce HTTP <-> VisitaMedicaService.
 */
class VisitaMedicaController {
  constructor(visitaService, auditoriaService) {
    this.service = visitaService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria; nunca falla (ver AuditoriaService). */
  _auditar = (req, accion, entidad, idEntidad, detalle) =>
    this.auditoria ? this.auditoria.registrar(req.usuario, accion, entidad, idEntidad, detalle) : null;

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
      await this._auditar(req, 'crear', 'visita', visita.id, `desde solicitud #${req.params.id}`);
      res.status(201).json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  actualizarClinico = async (req, res) => {
    try {
      const visita = await this.service.actualizarClinico(Number(req.params.id), req.body);
      await this._auditar(req, 'modificar', 'visita', visita.id, 'notas clinicas');
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  agregarExamen = async (req, res) => {
    try {
      const examen = await this.service.agregarExamen(Number(req.params.id), req.body);
      await this._auditar(req, 'crear', 'examen', examen.id, `visita #${req.params.id} · ${req.body.tipo}`);
      res.status(201).json(examen);
    } catch (error) { this._fallo(res, error); }
  };

  agregarPrescripcion = async (req, res) => {
    try {
      const rx = await this.service.agregarPrescripcion(Number(req.params.id), req.body);
      await this._auditar(req, 'crear', 'prescripcion', rx.id, `visita #${req.params.id} · ${req.body.medicamento}`);
      res.status(201).json(rx);
    } catch (error) { this._fallo(res, error); }
  };

  completar = async (req, res) => {
    try {
      const visita = await this.service.completar(Number(req.params.id));
      await this._auditar(req, 'modificar', 'visita', visita.id, 'completada');
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = VisitaMedicaController;
