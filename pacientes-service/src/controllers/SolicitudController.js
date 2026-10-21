/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce HTTP <-> SolicitudService. No contiene reglas de negocio.
 */
class SolicitudController {
  constructor(solicitudService, auditoriaService) {
    this.service = solicitudService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria; nunca falla (ver AuditoriaService). */
  _auditar = (req, accion, entidad, idEntidad, detalle) =>
    this.auditoria ? this.auditoria.registrar(req.usuario, accion, entidad, idEntidad, detalle) : null;

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  listar = async (req, res) => {
    try {
      const solicitudes = await this.service.listar();
      res.json(solicitudes);
    } catch (error) { this._fallo(res, error); }
  };

  obtener = async (req, res) => {
    try {
      const solicitud = await this.service.obtener(Number(req.params.id));
      res.json(solicitud);
    } catch (error) { this._fallo(res, error); }
  };

  listarPorPaciente = async (req, res) => {
    try {
      const solicitudes = await this.service.listarPorPaciente(Number(req.params.idPaciente));
      res.json(solicitudes);
    } catch (error) { this._fallo(res, error); }
  };

  crear = async (req, res) => {
    try {
      const idMedicoGeneral = Number(req.usuario.sub);
      // Pasamos el Authorization al service para que el cliente HTTP hacia
      // notificaciones-service pueda reusar el JWT del solicitante.
      const nueva = await this.service.crear(req.body, idMedicoGeneral, req.headers.authorization);
      await this._auditar(req, 'crear', 'solicitud', nueva.id, `paciente #${nueva.idPaciente} · ${nueva.especialidad}`);
      res.status(201).json(nueva);
    } catch (error) { this._fallo(res, error); }
  };

  asignarCita = async (req, res) => {
    try {
      const actualizada = await this.service.asignarCita(Number(req.params.id), req.body);
      await this._auditar(req, 'modificar', 'solicitud', actualizada.id,
        `cita asignada ${req.body.fechaCita} ${req.body.horaCita} · especialista #${req.body.idMedicoEspecialista}`);
      res.json(actualizada);
    } catch (error) { this._fallo(res, error); }
  };

  cancelar = async (req, res) => {
    try {
      const cancelada = await this.service.cancelar(Number(req.params.id));
      await this._auditar(req, 'cancelar', 'solicitud', cancelada.id, `paciente #${cancelada.idPaciente}`);
      res.json(cancelada);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = SolicitudController;
