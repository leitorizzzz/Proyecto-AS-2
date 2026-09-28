/**
 * CAPA DE PRESENTACION (API REST)
 */
class LaboratorioController {
  constructor(laboratorioService) {
    this.service = laboratorioService;
  }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  ordenesPendientes = async (req, res) => {
    try {
      const ordenes = await this.service.ordenesPendientes();
      res.json(ordenes);
    } catch (error) { this._fallo(res, error); }
  };

  identificarPaciente = async (req, res) => {
    try {
      const paciente = await this.service.identificarPaciente(req.params.dpi);
      res.json(paciente);
    } catch (error) { this._fallo(res, error); }
  };

  registrarResultado = async (req, res) => {
    try {
      const resultado = await this.service.registrarResultado(
        Number(req.params.idExamen),
        req.body
      );
      res.status(201).json(resultado);
    } catch (error) { this._fallo(res, error); }
  };

  obtenerResultadoPorExamen = async (req, res) => {
    try {
      const resultado = await this.service.obtenerResultadoPorExamen(
        Number(req.params.idExamen)
      );
      res.json(resultado);
    } catch (error) { this._fallo(res, error); }
  };

  costoConDescuento = async (req, res) => {
    try {
      const costo = await this.service.calcularCostoConDescuento(Number(req.params.idExamen));
      res.json(costo);
    } catch (error) { this._fallo(res, error); }
  };
}

module.exports = LaboratorioController;
