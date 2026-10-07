class NotificacionesController {
  constructor(service) { this.service = service; }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  enviarSolicitud = async (req, res) => {
    try {
      const notif = await this.service.enviarCorreoSolicitud(req.body);
      res.status(201).json(notif);
    } catch (error) { this._fallo(res, error); }
  };

  log = async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const estado = req.query.estado || null;
      const items = await this.service.logNotificaciones({ limit, estado });
      res.json(items);
    } catch (error) { this._fallo(res, error); }
  };

  obtener = async (req, res) => {
    try {
      const n = await this.service.obtenerPorId(Number(req.params.id));
      if (!n) return res.status(404).json({ error: 'Notificacion no encontrada' });
      res.json(n);
    } catch (error) { this._fallo(res, error); }
  };

  reintentar = async (req, res) => {
    try {
      const n = await this.service.reintentarManual(Number(req.params.id));
      res.json(n);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = NotificacionesController;
