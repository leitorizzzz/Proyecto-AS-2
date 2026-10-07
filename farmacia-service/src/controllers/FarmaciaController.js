/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 * No contiene reglas de negocio: solo recibe, delega y responde.
 */
class FarmaciaController {
  constructor(farmaciaService) {
    this.service = farmaciaService;
  }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  listarMedicamentos = async (req, res) => {
    try {
      const medicamentos = await this.service.listarMedicamentos();
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
      res.status(201).json(nuevo);
    } catch (error) { this._fallo(res, error); }
  };

  actualizarMedicamento = async (req, res) => {
    try {
      const actualizado = await this.service.actualizarMedicamento(Number(req.params.id), req.body);
      res.json(actualizado);
    } catch (error) { this._fallo(res, error); }
  };

  eliminarMedicamento = async (req, res) => {
    try {
      await this.service.eliminarMedicamento(Number(req.params.id));
      res.status(204).send();
    } catch (error) { this._fallo(res, error); }
  };

  dispensar = async (req, res) => {
    try {
      const dispensacion = await this.service.dispensarMedicamento(req.body);
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
