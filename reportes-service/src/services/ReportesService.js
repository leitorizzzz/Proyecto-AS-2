const Reporte = require('../models/Reporte');
const PdfKit = require('pdfkit');
const ExcelJS = require('exceljs');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Arma el objeto Reporte para cada tipo del enunciado y lo exporta a
 * PDF (con pdfkit) o Excel (con exceljs). El repositorio ya trae las
 * filas listas; aqui solo se organizan y se aplican totales.
 */
class ReportesService {
  constructor(repo) {
    this.repo = repo;
  }

  async generarReporte(tipo, filtros = {}) {
    switch (tipo) {
      case Reporte.TIPOS.COSTOS_POR_PACIENTE:  return this._costosPorPaciente(filtros);
      case Reporte.TIPOS.ANALISIS_MEDICO:       return this._analisisMedico(filtros);
      case Reporte.TIPOS.COBROS_POR_RANGO:      return this._cobrosPorRango(filtros);
      case Reporte.TIPOS.PAGOS_FUNDACION:       return this._pagosFundacion(filtros);
      case Reporte.TIPOS.ENTRADAS:              return this._entradas(filtros);
      case Reporte.TIPOS.EXAMENES:              return this._examenes(filtros);
      case Reporte.TIPOS.MEDICAMENTOS_APLICADOS: return this._medicamentosAplicados(filtros);
      default:
        throw Object.assign(
          new Error(`Tipo de reporte invalido: ${tipo}. Valores validos: ${Object.values(Reporte.TIPOS).join(', ')}`),
          { status: 400 }
        );
    }
  }

  _rango(filtros) {
    const desde = filtros.desde || '1900-01-01';
    const hasta = filtros.hasta || '2999-12-31';
    return { desde, hasta };
  }

  async _costosPorPaciente(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.costosPorPaciente({ ...rango, idPaciente: filtros.idPaciente });
    return new Reporte({
      tipo: Reporte.TIPOS.COSTOS_POR_PACIENTE,
      titulo: 'Costos por paciente',
      filtros: { ...rango, idPaciente: filtros.idPaciente },
      columnas: [
        { key: 'idPaciente', label: 'ID' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'dpi', label: 'DPI' },
        { key: 'totalMedicamentos', label: 'Medicamentos (Q)', tipo: 'moneda' },
        { key: 'totalCargos', label: 'Cargos (Q)', tipo: 'moneda' },
        { key: 'totalGeneral', label: 'Total (Q)', tipo: 'moneda' }
      ],
      filas,
      totales: this._sumar(filas, ['totalMedicamentos', 'totalCargos', 'totalGeneral'])
    });
  }

  async _analisisMedico(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.analisisMedico(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.ANALISIS_MEDICO,
      titulo: 'Analisis medico por especialidad',
      filtros: rango,
      columnas: [
        { key: 'especialidad', label: 'Especialidad' },
        { key: 'solicitudes', label: 'Solicitudes' },
        { key: 'visitasCompletadas', label: 'Visitas completadas' },
        { key: 'canceladas', label: 'Canceladas' }
      ],
      filas,
      totales: this._sumar(filas, ['solicitudes', 'visitasCompletadas', 'canceladas'])
    });
  }

  async _cobrosPorRango(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.cobrosPorRango(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.COBROS_POR_RANGO,
      titulo: 'Cobros por rango de fecha',
      filtros: rango,
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'monto', label: 'Monto (Q)', tipo: 'moneda' }
      ],
      filas,
      totales: this._sumar(filas, ['monto'])
    });
  }

  async _pagosFundacion(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.pagosFundacion(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.PAGOS_FUNDACION,
      titulo: 'Pagos realizados a la fundacion',
      filtros: rango,
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'monto', label: 'Monto (Q)', tipo: 'moneda' }
      ],
      filas,
      totales: this._sumar(filas, ['monto'])
    });
  }

  async _entradas(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.entradas(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.ENTRADAS,
      titulo: 'Entradas de dinero (donaciones y cuotas)',
      filtros: rango,
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'monto', label: 'Monto (Q)', tipo: 'moneda' }
      ],
      filas,
      totales: this._sumar(filas, ['monto'])
    });
  }

  async _examenes(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.examenes(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.EXAMENES,
      titulo: 'Examenes solicitados',
      filtros: rango,
      columnas: [
        { key: 'idExamen', label: 'ID' },
        { key: 'fechaSolicitud', label: 'Fecha', tipo: 'fecha' },
        { key: 'tipo', label: 'Tipo de examen' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'estadoResultado', label: 'Resultado' }
      ],
      filas
    });
  }

  async _medicamentosAplicados(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.medicamentosAplicados(rango);
    return new Reporte({
      tipo: Reporte.TIPOS.MEDICAMENTOS_APLICADOS,
      titulo: 'Medicamentos aplicados (dispensaciones)',
      filtros: rango,
      columnas: [
        { key: 'fecha', label: 'Fecha', tipo: 'fecha' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'medicamento', label: 'Medicamento' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'costoTotal', label: 'Costo (Q)', tipo: 'moneda' }
      ],
      filas,
      totales: this._sumar(filas, ['cantidad', 'costoTotal'])
    });
  }

  _sumar(filas, keys) {
    const t = {};
    for (const k of keys) t[k] = filas.reduce((a, f) => a + (Number(f[k]) || 0), 0);
    return t;
  }

  // ---------- Export ----------

  async exportarPDF(reporte, stream) {
    const doc = new PdfKit({ size: 'LETTER', margin: 48 });
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text(reporte.titulo);
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(`Asilo Cabeza de Algodon - generado ${new Date(reporte.generadoEn).toLocaleString('es-GT')}`);
    if (reporte.filtros?.desde || reporte.filtros?.hasta) {
      doc.text(`Periodo: ${this._fecha(reporte.filtros.desde)} a ${this._fecha(reporte.filtros.hasta)}`);
    }
    doc.fillColor('#000');
    doc.moveDown(1);

    // Cabecera
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / reporte.columnas.length;
    doc.fontSize(10).font('Helvetica-Bold');
    reporte.columnas.forEach((c, i) => {
      doc.text(c.label, doc.page.margins.left + i * colWidth, doc.y, { width: colWidth, continued: i < reporte.columnas.length - 1 });
    });
    doc.moveDown(0.5);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);
    for (const fila of reporte.filas) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const yStart = doc.y;
      reporte.columnas.forEach((c, i) => {
        const val = this._formatValor(fila[c.key], c.tipo);
        doc.text(String(val ?? ''), doc.page.margins.left + i * colWidth, yStart,
          { width: colWidth, continued: i < reporte.columnas.length - 1 });
      });
      doc.moveDown(0.4);
    }

    if (reporte.totales) {
      doc.moveDown(0.5);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold');
      const totalesText = reporte.columnas.map(c =>
        reporte.totales[c.key] != null ? `${c.label}: ${this._formatValor(reporte.totales[c.key], c.tipo)}` : ''
      ).filter(Boolean).join('    ');
      doc.text(totalesText);
    }

    doc.end();
  }

  async exportarExcel(reporte, stream) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Asilo Cabeza de Algodon';
    wb.created = new Date();
    const ws = wb.addWorksheet(reporte.titulo.slice(0, 30));

    ws.mergeCells(1, 1, 1, reporte.columnas.length);
    ws.getCell(1, 1).value = reporte.titulo;
    ws.getCell(1, 1).font = { size: 16, bold: true };

    ws.mergeCells(2, 1, 2, reporte.columnas.length);
    const rango = reporte.filtros?.desde && reporte.filtros?.hasta
      ? `Periodo: ${this._fecha(reporte.filtros.desde)} a ${this._fecha(reporte.filtros.hasta)}`
      : `Generado: ${new Date(reporte.generadoEn).toLocaleString('es-GT')}`;
    ws.getCell(2, 1).value = rango;
    ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };

    const headerRow = ws.addRow(['']); // padding row
    ws.addRow(reporte.columnas.map(c => c.label));
    const headerIdx = ws.rowCount;
    ws.getRow(headerIdx).font = { bold: true };
    ws.getRow(headerIdx).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF444444' } } };
    });

    for (const fila of reporte.filas) {
      const row = ws.addRow(reporte.columnas.map(c => this._valorExcel(fila[c.key], c.tipo)));
      reporte.columnas.forEach((c, i) => {
        if (c.tipo === 'moneda') row.getCell(i + 1).numFmt = '"Q"#,##0.00';
        if (c.tipo === 'fecha') row.getCell(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
      });
    }

    if (reporte.totales) {
      const totalRow = ws.addRow(reporte.columnas.map(c =>
        reporte.totales[c.key] != null ? reporte.totales[c.key] : (c === reporte.columnas[0] ? 'Total' : null)
      ));
      // primera columna dice "Total" si no era numerica
      if (reporte.totales[reporte.columnas[0].key] == null) totalRow.getCell(1).value = 'Total';
      totalRow.font = { bold: true };
      reporte.columnas.forEach((c, i) => {
        if (c.tipo === 'moneda') totalRow.getCell(i + 1).numFmt = '"Q"#,##0.00';
      });
    }

    ws.columns.forEach((col, i) => {
      const header = reporte.columnas[i]?.label || '';
      let maxLen = header.length;
      col.eachCell({ includeEmpty: true }, cell => {
        const l = String(cell.value ?? '').length;
        if (l > maxLen) maxLen = l;
      });
      col.width = Math.min(Math.max(maxLen + 2, 10), 40);
    });

    await wb.xlsx.write(stream);
    stream.end();
  }

  _formatValor(v, tipo) {
    if (v == null) return '';
    if (tipo === 'moneda') return 'Q ' + Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (tipo === 'fecha') return this._fecha(v);
    return v;
  }

  _valorExcel(v, tipo) {
    if (v == null) return null;
    if (tipo === 'fecha') return new Date(v);
    if (tipo === 'moneda') return Number(v);
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v;
    return String(v);
  }

  _fecha(v) {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
  }
}

module.exports = ReportesService;
