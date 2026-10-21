/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 */
class PacienteController {
  constructor(pacienteService, auditoriaService) {
    this.service = pacienteService;
    this.auditoria = auditoriaService;
  }

  /** Registra en auditoria; nunca falla (ver AuditoriaService). */
  _auditar = (req, accion, entidad, idEntidad, detalle) =>
    this.auditoria ? this.auditoria.registrar(req.usuario, accion, entidad, idEntidad, detalle) : null;

  listar = async (req, res) => {
    try {
      const incluirInactivos = req.query.incluirInactivos === 'true';
      if (incluirInactivos && req.usuario?.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administracion puede ver pacientes desactivados' });
      }
      const pacientes = await this.service.listar({ incluirInactivos });
      res.json(pacientes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  obtener = async (req, res) => {
    try {
      const paciente = await this.service.obtener(Number(req.params.id));
      res.json(paciente);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };

  crear = async (req, res) => {
    try {
      const nuevo = await this.service.registrar(req.body);
      await this._auditar(req, 'crear', 'paciente', nuevo.id, `${nuevo.nombres} ${nuevo.apellidos}`);
      res.status(201).json(nuevo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  actualizar = async (req, res) => {
    try {
      const actualizado = await this.service.actualizar(Number(req.params.id), req.body);
      await this._auditar(req, 'modificar', 'paciente', actualizado.id, 'expediente');
      res.json(actualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  /** DELETE /api/pacientes/:id: borrado logico (activo = 0). */
  desactivar = async (req, res) => {
    try {
      const p = await this.service.desactivar(Number(req.params.id));
      await this._auditar(req, 'desactivar', 'paciente', p.id, `${p.nombres} ${p.apellidos}`);
      res.json(p);
    } catch (error) {
      res.status(error.status || 404).json({ error: error.message });
    }
  };

  reactivar = async (req, res) => {
    try {
      const p = await this.service.reactivar(Number(req.params.id));
      await this._auditar(req, 'reactivar', 'paciente', p.id, `${p.nombres} ${p.apellidos}`);
      res.json(p);
    } catch (error) {
      res.status(error.status || 404).json({ error: error.message });
    }
  };
}

module.exports = PacienteController;
