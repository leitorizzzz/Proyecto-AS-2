const Reporte = require('../models/Reporte');

class ReportesController {
  constructor(service) { this.service = service; }

  _fallo = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  };

  generarReporte = async (req, res) => {
    try {
      const tipo = req.params.tipo;
      const filtros = {
        desde: req.query.desde,
        hasta: req.query.hasta,
        idPaciente: req.query.idPaciente ? Number(req.query.idPaciente) : null
      };
      const formato = (req.query.formato || 'json').toLowerCase();

      const reporte = await this.service.generarReporte(tipo, filtros);

      if (formato === 'json') return res.json(reporte);

      const nombreArchivo = `${reporte.tipo}-${new Date().toISOString().slice(0, 10)}`;

      if (formato === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);
        return this.service.exportarPDF(reporte, res);
      }
      if (formato === 'excel' || formato === 'xlsx') {
        res.setHeader('Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.xlsx"`);
        return this.service.exportarExcel(reporte, res);
      }

      return res.status(400).json({ error: 'formato debe ser json, pdf o excel' });
    } catch (error) { this._fallo(res, error); }
  };

  listarTipos = (req, res) => {
    res.json(Object.values(Reporte.TIPOS));
  };
}

module.exports = ReportesController;
