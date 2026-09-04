/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 * No contiene reglas de negocio: solo recibe, delega y responde.
 */
class FarmaciaController {
  constructor(farmaciaService) {
    this.service = farmaciaService;
  }

  listarMedicamentos = (req, res) => {
    const medicamentos = this.service.listarMedicamentos();
    res.json(medicamentos);
  };

  obtenerMedicamento = (req, res) => {
    try {
      const medicamento = this.service.obtenerMedicamento(Number(req.params.id));
      res.json(medicamento);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };

  crearMedicamento = (req, res) => {
    try {
      const nuevo = this.service.registrarMedicamento(req.body);
      res.status(201).json(nuevo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  actualizarMedicamento = (req, res) => {
    try {
      const actualizado = this.service.actualizarMedicamento(Number(req.params.id), req.body);
      res.json(actualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  eliminarMedicamento = (req, res) => {
    try {
      this.service.eliminarMedicamento(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };

  dispensar = (req, res) => {
    try {
      const dispensacion = this.service.dispensarMedicamento(req.body);
      res.status(201).json(dispensacion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  historialPaciente = (req, res) => {
    const historial = this.service.historialPorPaciente(Number(req.params.idPaciente));
    res.json(historial);
  };
}

module.exports = FarmaciaController;
