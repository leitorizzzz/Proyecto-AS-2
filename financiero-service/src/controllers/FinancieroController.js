class FinancieroController {
  constructor(service) { this.service = service; }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  estadoCuenta = async (req, res) => {
    try { res.json(await this.service.estadoCuenta(Number(req.params.idPaciente))); }
    catch (error) { this._fallo(res, error); }
  };

  crearCargo = async (req, res) => {
    try { res.status(201).json(await this.service.generarCargo(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  registrarPago = async (req, res) => {
    try { res.status(201).json(await this.service.registrarPagoCuota(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  crearDonante = async (req, res) => {
    try { res.status(201).json(await this.service.registrarDonante(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  listarDonantes = async (req, res) => {
    try {
      const incluirInactivos = req.query.incluirInactivos === 'true';
      if (incluirInactivos && req.usuario?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administracion puede ver donantes desactivados' });
      }
      res.json(await this.service.listarDonantes({ incluirInactivos }));
    }
    catch (error) { this._fallo(res, error); }
  };

  desactivarDonante = async (req, res) => {
    try { res.json(await this.service.desactivarDonante(Number(req.params.id))); }
    catch (error) { this._fallo(res, error); }
  };

  reactivarDonante = async (req, res) => {
    try { res.json(await this.service.reactivarDonante(Number(req.params.id))); }
    catch (error) { this._fallo(res, error); }
  };

  registrarDonacion = async (req, res) => {
    try { res.status(201).json(await this.service.registrarDonacion(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  listarDonaciones = async (req, res) => {
    try {
      res.json(await this.service.listarDonaciones({
        desde: req.query.desde, hasta: req.query.hasta
      }));
    } catch (error) { this._fallo(res, error); }
  };

  registrarGasto = async (req, res) => {
    try { res.status(201).json(await this.service.registrarGasto(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  listarGastos = async (req, res) => {
    try {
      res.json(await this.service.listarGastos({
        desde: req.query.desde, hasta: req.query.hasta
      }));
    } catch (error) { this._fallo(res, error); }
  };

  registrarPagoFundacion = async (req, res) => {
    try { res.status(201).json(await this.service.registrarPagoFundacion(req.body)); }
    catch (error) { this._fallo(res, error); }
  };

  listarPagosFundacion = async (req, res) => {
    try {
      res.json(await this.service.listarPagosFundacion({
        desde: req.query.desde, hasta: req.query.hasta
      }));
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = FinancieroController;
