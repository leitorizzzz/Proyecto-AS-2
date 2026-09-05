/**
 * CAPA DE PRESENTACION (API REST)
 * Traduce peticiones HTTP en llamadas a la capa de logica de negocio.
 */
class PacienteController {
  constructor(pacienteService) {
    this.service = pacienteService;
  }

  listar = async (req, res) => {
    try {
      const pacientes = await this.service.listar();
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
      res.status(201).json(nuevo);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  actualizar = async (req, res) => {
    try {
      const actualizado = await this.service.actualizar(Number(req.params.id), req.body);
      res.json(actualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };

  eliminar = async (req, res) => {
    try {
      await this.service.eliminar(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  };
}

module.exports = PacienteController;
