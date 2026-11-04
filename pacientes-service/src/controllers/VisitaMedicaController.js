const AuditoriaService = require('../services/AuditoriaService');

/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce HTTP <-> VisitaMedicaService.
 */
class VisitaMedicaController {
  constructor(visitaService, auditoriaService) {
    this.service = visitaService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria (usuario, IP, modulo, antes/despues); nunca falla. */
  _auditar = (req, accion, entidad, idEntidad, detalle, antes = null, despues = null) =>
    this.auditoria
      ? this.auditoria.registrar(AuditoriaService.contextoDe(req, 'visitas'),
          accion, entidad, idEntidad, detalle, { antes, despues })
      : null;

  _fallo = (res, error) => {
    const status = error.status || 500;
    const cuerpo = { error: error.message };
    if (error.camposFaltantes) {
      cuerpo.camposFaltantes = error.camposFaltantes;
      cuerpo.estadoVisita = error.estadoVisita;
      if (error.pendientes?.length) cuerpo.pendientes = error.pendientes;
    }
    res.status(status).json(cuerpo);
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
      await this._auditar(req, 'crear', 'visita', visita.id, `desde solicitud #${req.params.id}`, null, visita);
      res.status(201).json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  actualizarClinico = async (req, res) => {
    try {
      const antes = await this.service.obtener(Number(req.params.id));
      const visita = await this.service.actualizarClinico(Number(req.params.id), req.body);
      await this._auditar(req, 'modificar', 'visita', visita.id, 'notas clinicas',
        { diagnostico: antes.diagnostico, observaciones: antes.observaciones, estado: antes.estado },
        { diagnostico: visita.diagnostico, observaciones: visita.observaciones, estado: visita.estado });
      res.json(visita);
    } catch (error) { this._fallo(res, error); }
  };

  agregarExamen = async (req, res) => {
    try {
      const examen = await this.service.agregarExamen(Number(req.params.id), req.body);
      await this._auditar(req, 'crear', 'examen', examen.id, `visita #${req.params.id} · ${req.body.tipo}`, null, examen);
      res.status(201).json(examen);
    } catch (error) { this._fallo(res, error); }
  };

  agregarPrescripcion = async (req, res) => {
    try {
      const rx = await this.service.agregarPrescripcion(Number(req.params.id), req.body);
      await this._auditar(req, 'crear', 'prescripcion', rx.id, `visita #${req.params.id} · ${req.body.medicamento}`, null, rx);
      res.status(201).json(rx);
    } catch (error) { this._fallo(res, error); }
  };

  completar = async (req, res) => {
    try {
      const antes = await this.service.obtener(Number(req.params.id));
      const visita = await this.service.completar(Number(req.params.id), req.body || {});
      await this._auditar(req, 'modificar', 'visita', visita.id, 'completada',
        { estado: antes.estado }, { estado: visita.estado, fechaCompletada: visita.fechaCompletada });
      if (visita.cargo) {
        await this._auditar(req, 'crear', 'cargo', visita.cargo.id,
          `automatico visita #${visita.id} · Q${visita.cargo.monto}`, null, visita.cargo);
      }
      res.json(visita);
    } catch (error) {
      if (error.camposFaltantes) {
        await this._auditar(req, 'modificar', 'visita', Number(req.params.id),
          `intento de cierre: faltan ${[...error.camposFaltantes, ...(error.pendientes || [])].join(', ')}`, null, { estado: error.estadoVisita });
      }
      this._fallo(res, error);
    }
  };
}

module.exports = VisitaMedicaController;
