const AuditoriaService = require('../services/AuditoriaService');

class FinancieroController {
  constructor(service, auditoriaService) {
    this.service = service;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria (usuario, IP, modulo, antes/despues); nunca falla. */
  _auditar = (req, accion, entidad, idEntidad, detalle, antes = null, despues = null) =>
    this.auditoria
      ? this.auditoria.registrar(AuditoriaService.contextoDe(req, 'financiero'),
          accion, entidad, idEntidad, detalle, { antes, despues })
      : null;

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  estadoCuenta = async (req, res) => {
    try { res.json(await this.service.estadoCuenta(Number(req.params.idPaciente))); }
    catch (error) { this._fallo(res, error); }
  };

  crearCargo = async (req, res) => {
    try {
      const r = await this.service.generarCargo(req.body);
      await this._auditar(req, 'crear', 'cargo', r.id, `paciente #${r.idPaciente} · ${r.concepto} · Q${r.monto}`, null, r);
      res.status(201).json(r);
    }
    catch (error) { this._fallo(res, error); }
  };

  abonarCargo = async (req, res) => {
    try {
      const antes = await this.service.obtenerCargo(Number(req.params.id)).catch(() => null);
      const r = await this.service.registrarAbono(Number(req.params.id), req.body, req.usuario?.sub);
      await this._auditar(req, 'crear', 'abono', r.abono.id,
        `cargo #${r.id} · Q${r.abono.monto} · saldo Q${r.saldo}`, antes, r);
      res.status(201).json(r);
    }
    catch (error) { this._fallo(res, error); }
  };

  registrarPago = async (req, res) => {
    try {
      const r = await this.service.registrarPagoCuota(req.body);
      await this._auditar(req, 'crear', 'cuota', r.id, `paciente #${r.idPaciente} · ${r.mes}/${r.anio} pagada`, null, r);
      res.status(201).json(r);
    }
    catch (error) { this._fallo(res, error); }
  };

  crearDonante = async (req, res) => {
    try {
      const r = await this.service.registrarDonante(req.body);
      await this._auditar(req, 'crear', 'donante', r.id, r.nombre, null, r);
      res.status(201).json(r);
    }
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
    try {
      const antes = await this.service.obtenerDonante(Number(req.params.id)).catch(() => null);
      const d = await this.service.desactivarDonante(Number(req.params.id));
      await this._auditar(req, 'desactivar', 'donante', d.id, d.nombre, antes, d);
      res.json(d);
    }
    catch (error) { this._fallo(res, error); }
  };

  reactivarDonante = async (req, res) => {
    try {
      const antes = await this.service.obtenerDonante(Number(req.params.id)).catch(() => null);
      const d = await this.service.reactivarDonante(Number(req.params.id));
      await this._auditar(req, 'reactivar', 'donante', d.id, d.nombre, antes, d);
      res.json(d);
    }
    catch (error) { this._fallo(res, error); }
  };

  registrarDonacion = async (req, res) => {
    try {
      const r = await this.service.registrarDonacion(req.body);
      await this._auditar(req, 'crear', 'donacion', r.id, `donante #${r.idDonante} · Q${r.monto}`, null, r);
      res.status(201).json(r);
    }
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
    try {
      const r = await this.service.registrarGasto(req.body);
      await this._auditar(req, 'crear', 'gasto', r.id, `${r.concepto} · Q${r.monto}`, null, r);
      res.status(201).json(r);
    }
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
    try {
      const r = await this.service.registrarPagoFundacion(req.body);
      await this._auditar(req, 'crear', 'pago_fundacion', r.id, `${r.concepto} · Q${r.monto}`, null, r);
      res.status(201).json(r);
    }
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
