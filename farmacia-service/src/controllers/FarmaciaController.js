/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 * No contiene reglas de negocio: solo recibe, delega y responde.
 */
class FarmaciaController {
  constructor(farmaciaService) {
    this.service = farmaciaService;
  }

  listarMedicamentos = async (req, res) => {
    try {
      const medicamentos = await this.service.listarMedicamentos();
      res.json(medicamentos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  obtenerMedicamento = async (req, res) => {
    try {
      const medicamento = await this.service.obtenerMedicamento(Number(req.params.id));
      res.json(medicamento);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };

  crearMedicamento = async (req, res) => {
    try {
      const nuevo = await this.service.registrarMedicamento(req.body);
      res.status(201).json(nuevo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  actualizarMedicamento = async (req, res) => {
    try {
      const actualizado = await this.service.actualizarMedicamento(Number(req.params.id), req.body);
      res.json(actualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  eliminarMedicamento = async (req, res) => {
    try {
      await this.service.eliminarMedicamento(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };

  dispensar = async (req, res) => {
    try {
      const dispensacion = await this.service.dispensarMedicamento(req.body);
      res.status(201).json(dispensacion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  historialPaciente = async (req, res) => {
    try {
      const historial = await this.service.historialPorPaciente(Number(req.params.idPaciente));
      res.json(historial);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

module.exports = FarmaciaController;
