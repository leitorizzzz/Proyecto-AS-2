const AuditoriaService = require('../services/AuditoriaService');

/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 * No contiene reglas de negocio: solo recibe, delega y responde.
 */
class FarmaciaController {
  constructor(farmaciaService, auditoriaService) {
    this.service = farmaciaService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria (usuario, IP, modulo, antes/despues); nunca falla. */
  _auditar = (req, accion, entidad, idEntidad, detalle, antes = null, despues = null) =>
    this.auditoria
      ? this.auditoria.registrar(AuditoriaService.contextoDe(req, 'farmacia'),
          accion, entidad, idEntidad, detalle, { antes, despues })
      : null;

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  listarMedicamentos = async (req, res) => {
    try {
      const incluirInactivos = req.query.incluirInactivos === 'true';
      if (incluirInactivos && req.usuario?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administracion puede ver medicamentos desactivados' });
      }
      const medicamentos = await this.service.listarMedicamentos({ incluirInactivos });
      res.json(medicamentos);
    } catch (error) { this._fallo(res, error); }
  };

  obtenerMedicamento = async (req, res) => {
    try {
      const medicamento = await this.service.obtenerMedicamento(Number(req.params.id));
      res.json(medicamento);
    } catch (error) { this._fallo(res, error); }
  };

  crearMedicamento = async (req, res) => {
    try {
      const nuevo = await this.service.registrarMedicamento(req.body);
      await this._auditar(req, 'crear', 'medicamento', nuevo.id, nuevo.nombre, null, nuevo);
      res.status(201).json(nuevo);
    } catch (error) { this._fallo(res, error); }
  };

  actualizarMedicamento = async (req, res) => {
    try {
      const antes = await this.service.obtenerMedicamento(Number(req.params.id));
      const actualizado = await this.service.actualizarMedicamento(Number(req.params.id), req.body);
      await this._auditar(req, 'modificar', 'medicamento', actualizado.id, actualizado.nombre, antes, actualizado);
      res.json(actualizado);
    } catch (error) { this._fallo(res, error); }
  };

  /** DELETE /medicamentos/:id: borrado logico (activo = 0). */
  desactivarMedicamento = async (req, res) => {
    try {
      const antes = await this.service.obtenerMedicamento(Number(req.params.id));
      const m = await this.service.desactivarMedicamento(Number(req.params.id));
      await this._auditar(req, 'desactivar', 'medicamento', m.id, m.nombre, antes, m);
      res.json(m);
    } catch (error) { this._fallo(res, error); }
  };

  reactivarMedicamento = async (req, res) => {
    try {
      const antes = await this.service.obtenerMedicamento(Number(req.params.id));
      const m = await this.service.reactivarMedicamento(Number(req.params.id));
      await this._auditar(req, 'reactivar', 'medicamento', m.id, m.nombre, antes, m);
      res.json(m);
    } catch (error) { this._fallo(res, error); }
  };

  dispensar = async (req, res) => {
    try {
      const dispensacion = await this.service.dispensarMedicamento(req.body);
      await this._auditar(req, 'crear', 'dispensacion', dispensacion.id,
        `prescripcion #${dispensacion.idPrescripcion} · paciente #${dispensacion.idPaciente} · ${dispensacion.cantidad} x ${dispensacion.medicamento}`,
        null, dispensacion);
      res.status(201).json(dispensacion);
    } catch (error) { this._fallo(res, error); }
  };

  prescripcionesPendientesPaciente = async (req, res) => {
    try {
      const items = await this.service.prescripcionesPendientesPaciente(
        Number(req.params.idPaciente)
      );
      res.json(items);
    } catch (error) { this._fallo(res, error); }
  };

  historialPaciente = async (req, res) => {
    try {
      const historial = await this.service.historialPorPaciente(Number(req.params.idPaciente));
      res.json(historial);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = FarmaciaController;
