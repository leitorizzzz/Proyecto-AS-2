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
      const items = await this.service.logNotificaciones({ limit });
      res.json(items);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = NotificacionesController;
