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

  /**
   * Caso 23: desde/hasta son fechas YYYY-MM-DD reales; cualquier otra cosa
   * (incluido texto con SQL) es 400 antes de llegar a la BD.
   */
  _rango(filtros) {
    const desde = filtros.desde || '1900-01-01';
    const hasta = filtros.hasta || '2999-12-31';
    for (const [nombre, v] of [['desde', desde], ['hasta', hasta]]) {
      if (!ReportesService.esFechaValida(v)) {
        throw Object.assign(new Error(`${nombre} debe ser una fecha YYYY-MM-DD valida`), { status: 400 });
      }
    }
    if (desde > hasta) throw Object.assign(new Error('desde no puede ser posterior a hasta'), { status: 400 });
    return { desde, hasta };
  }

  static esFechaValida(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
  }

  async _costosPorPaciente(filtros) {
    const rango = this._rango(filtros);
    if (filtros.idPaciente != null && !(Number.isInteger(filtros.idPaciente) && filtros.idPaciente > 0)) {
      throw Object.assign(new Error('idPaciente debe ser un entero positivo'), { status: 400 });
    }
    const filas = await this.repo.costosPorPaciente({ ...rango, idPaciente: filtros.idPaciente });
    return new Reporte({
      tipo: Reporte.TIPOS.COSTOS_POR_PACIENTE,
      titulo: 'Costos por paciente',
      filtros: { ...rango, idPaciente: filtros.idPaciente },
      columnas: [
        { key: 'idPaciente', label: 'ID' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'dpi', label: 'DPI' },
        { key: 'consulta', label: 'Consulta (Q)', tipo: 'moneda' },
        { key: 'laboratorio', label: 'Laboratorio (Q)', tipo: 'moneda' },
        { key: 'farmacia', label: 'Farmacia (Q)', tipo: 'moneda' },
        { key: 'otros', label: 'Otros cargos (Q)', tipo: 'moneda' },
        // En Excel va como formula de la fila (suma de los rubros).
        { key: 'totalGeneral', label: 'Total (Q)', tipo: 'moneda',
          formula: ['consulta', 'laboratorio', 'farmacia', 'otros'] }
      ],
      filas,
      totales: this._sumar(filas, ['consulta', 'laboratorio', 'farmacia', 'otros', 'totalGeneral'])
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
    for (const k of keys) t[k] = Math.round(filas.reduce((a, f) => a + (Number(f[k]) || 0), 0) * 100) / 100;
    return t;
  }

  // ---------- Export ----------

  async exportarPDF(reporte, stream) {
    const doc = new PdfKit({ size: 'LETTER', margin: 48 });
    doc.pipe(stream);

    // Cabecera institucional (mismo acento de marca que la UI).
    doc.rect(0, 0, doc.page.width, 6).fill(ReportesService.MARCA.acento);
    doc.fillColor(ReportesService.MARCA.acento).fontSize(9).font('Helvetica-Bold')
      .text(ReportesService.MARCA.institucion.toUpperCase(), { characterSpacing: 1 });
    doc.fillColor('#09090B').fontSize(18).font('Helvetica-Bold').text(reporte.titulo);
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(`${ReportesService.MARCA.sistema} - generado ${new Date(reporte.generadoEn).toLocaleString('es-GT')}`);
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

  /** Celdas de Excel con formula real y su resultado precalculado. */
  _formulaFila(reporte, fila, filaExcel, ws, col) {
    const letras = col.formula.map(k => ws.getColumn(reporte.columnas.findIndex(c => c.key === k) + 1).letter);
    return { formula: letras.map(l => `${l}${filaExcel}`).join('+'), result: Number(fila[col.key]) || 0 };
  }

  async exportarExcel(reporte, stream) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Asilo Cabeza de Algodon';
    wb.created = new Date();
    const ws = wb.addWorksheet(reporte.titulo.slice(0, 30), {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: { oddFooter: `&L${ReportesService.MARCA.institucion}&RPagina &P de &N` }
    });
    const n = reporte.columnas.length;
    const borde = { style: 'thin', color: { argb: 'FFD4D4D8' } };

    // Cabecera institucional: banda de marca, titulo, periodo y fecha.
    ws.mergeCells(1, 1, 1, n);
    Object.assign(ws.getCell(1, 1), {
      value: ReportesService.MARCA.institucion.toUpperCase(),
      font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD11A6D' } },
      alignment: { vertical: 'middle' }
    });
    ws.getRow(1).height = 22;
    ws.mergeCells(2, 1, 2, n);
    Object.assign(ws.getCell(2, 1), { value: reporte.titulo, font: { size: 16, bold: true, color: { argb: 'FF09090B' } } });
    ws.mergeCells(3, 1, 3, n);
    const periodo = reporte.filtros?.desde && reporte.filtros?.hasta
      ? `Periodo: ${this._fecha(reporte.filtros.desde)} a ${this._fecha(reporte.filtros.hasta)} · `
      : '';
    Object.assign(ws.getCell(3, 1), {
      value: `${periodo}Generado: ${new Date(reporte.generadoEn).toLocaleString('es-GT')} · ${ReportesService.MARCA.sistema}`,
      font: { italic: true, size: 9, color: { argb: 'FF52525B' } }
    });
    ws.addRow([]);

    const header = ws.addRow(reporte.columnas.map(c => c.label));
    const headerIdx = header.number;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
      cell.border = { top: borde, bottom: borde, left: borde, right: borde };
    });
    ws.views = [{ state: 'frozen', ySplit: headerIdx }];

    const primera = headerIdx + 1;
    for (const fila of reporte.filas) {
      const row = ws.addRow(reporte.columnas.map(c => this._valorExcel(fila[c.key], c.tipo)));
      reporte.columnas.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.formula) cell.value = this._formulaFila(reporte, fila, row.number, ws, c);
        if (c.tipo === 'moneda') cell.numFmt = '"Q"#,##0.00';
        if (c.tipo === 'fecha') cell.numFmt = 'yyyy-mm-dd hh:mm';
        cell.border = { bottom: borde };
      });
    }
    const ultima = ws.rowCount;
    ws.autoFilter = { from: { row: headerIdx, column: 1 }, to: { row: headerIdx, column: n } };

    // Caso 22: los totales son formulas SUM sobre las filas de datos (con
    // el resultado precalculado para visores que no recalculan).
    if (reporte.totales) {
      const totalRow = ws.addRow(reporte.columnas.map(() => null));
      reporte.columnas.forEach((c, i) => {
        const cell = totalRow.getCell(i + 1);
        if (reporte.totales[c.key] != null) {
          const l = ws.getColumn(i + 1).letter;
          cell.value = reporte.filas.length
            ? { formula: `SUM(${l}${primera}:${l}${ultima})`, result: reporte.totales[c.key] }
            : 0;
        }
        if (c.tipo === 'moneda') cell.numFmt = '"Q"#,##0.00';
        cell.border = { top: { style: 'double', color: { argb: 'FF09090B' } } };
      });
      if (reporte.totales[reporte.columnas[0].key] == null) totalRow.getCell(1).value = 'Total';
      totalRow.font = { bold: true };
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

ReportesService.MARCA = Object.freeze({
  institucion: 'Asilo de Ancianos "Cabeza de Algodon" - Mazatenango',
  sistema: 'Sistema de Gestion Integral',
  acento: '#D11A6D'
});

module.exports = ReportesService;
