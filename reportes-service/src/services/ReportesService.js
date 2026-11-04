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
          new Error(`Tipo de reporte inválido: ${tipo}. Valores válidos: ${Object.values(Reporte.TIPOS).join(', ')}`),
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
        throw Object.assign(new Error(`${nombre} debe ser una fecha YYYY-MM-DD válida`), { status: 400 });
      }
    }
    if (desde > hasta) throw Object.assign(new Error('desde no puede ser posterior a hasta'), { status: 400 });
    return { desde, hasta };
  }

  /**
   * Bloque 3: limites que recibe el repositorio. Las fechas se guardan en
   * UTC y el usuario elige dias de Guatemala (UTC-6): "hasta" es inclusivo,
   * asi que el limite superior es el inicio del dia siguiente, exclusivo
   * (fecha >= desde AND fecha < hasta). Un rango hoy-a-hoy trae todo hoy.
   */
  _limites({ desde, hasta }) {
    const inicioGt = dia => new Date(Date.parse(`${dia}T00:00:00Z`) + ReportesService.DESFASE_GT_MS);
    return { desde: inicioGt(desde), hasta: new Date(inicioGt(hasta).getTime() + 24 * 60 * 60 * 1000) };
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
    const filas = await this.repo.costosPorPaciente({ ...this._limites(rango), idPaciente: filtros.idPaciente });
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
    const filas = await this.repo.analisisMedico(this._limites(rango));
    return new Reporte({
      tipo: Reporte.TIPOS.ANALISIS_MEDICO,
      titulo: 'Análisis médico por especialidad',
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
    const filas = await this.repo.cobrosPorRango(this._limites(rango));
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
    const filas = await this.repo.pagosFundacion(this._limites(rango));
    return new Reporte({
      tipo: Reporte.TIPOS.PAGOS_FUNDACION,
      titulo: 'Pagos realizados a la fundación',
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
    const filas = await this.repo.entradas(this._limites(rango));
    return new Reporte({
      tipo: Reporte.TIPOS.ENTRADAS,
      titulo: 'Entradas de dinero (donaciones, cuotas y abonos)',
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
    // Caso 15 del SQA: precio base, descuento de la fundacion y costo de cada
    // examen (los registrados al ordenar; ordenes anteriores, el catalogo).
    const pct = Number(process.env.DESCUENTO_FUNDACION || 0.20);
    const filas = (await this.repo.examenes(this._limites(rango))).map(f => {
      const registrado = f.precioBase != null && f.costo != null;
      const base = registrado ? Number(f.precioBase) : (f.precioCatalogo != null ? Number(f.precioCatalogo) : null);
      const descuento = registrado ? Number(f.descuento) : (base != null ? Math.round(base * pct * 100) / 100 : null);
      const costo = registrado ? Number(f.costo) : (base != null ? Math.round((base - descuento) * 100) / 100 : null);
      const { precioCatalogo, ...resto } = f;
      return { ...resto, estado: f.estado || 'pendiente', precioBase: base, descuento, costo };
    });
    return new Reporte({
      tipo: Reporte.TIPOS.EXAMENES,
      titulo: 'Exámenes solicitados',
      filtros: rango,
      columnas: [
        { key: 'idExamen', label: 'ID' },
        { key: 'fechaSolicitud', label: 'Fecha', tipo: 'fecha' },
        { key: 'tipo', label: 'Tipo de examen' },
        { key: 'paciente', label: 'Paciente' },
        { key: 'estado', label: 'Estado' },
        { key: 'precioBase', label: 'Precio base (Q)', tipo: 'moneda' },
        { key: 'descuento', label: `Descuento ${Math.round(pct * 100)} % (Q)`, tipo: 'moneda' },
        { key: 'costo', label: 'Costo con descuento (Q)', tipo: 'moneda' },
        { key: 'estadoResultado', label: 'Resultado' }
      ],
      filas,
      totales: this._sumar(filas, ['precioBase', 'descuento', 'costo'])
    });
  }

  async _medicamentosAplicados(filtros) {
    const rango = this._rango(filtros);
    const filas = await this.repo.medicamentosAplicados(this._limites(rango));
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

  /**
   * PDF con tabla de verdad (caso 22 del SQA: "aparece todo revuelto; los
   * numeros no estan tabulados"). Antes cada fila se escribia con
   * continued:true y anchos iguales: encabezados escalonados, numeros en
   * zigzag y montos partidos ("Q" en una linea, la cifra en otra).
   *  - anchos por columna calculados del contenido: montos, fechas y
   *    numeros nunca se parten; el texto se reparte el resto y se ajusta
   *    dentro de su celda;
   *  - numeros y montos alineados a la derecha; linea separadora por fila;
   *  - encabezado de tabla repetido en cada pagina, filas sin cortar entre
   *    paginas, fila de totales alineada a sus columnas;
   *  - horizontal si hay mas de 5 columnas; pie "Pagina N de M".
   */
  async exportarPDF(reporte, stream) {
    const horizontal = reporte.columnas.length > 5;
    const doc = new PdfKit({ size: 'LETTER', layout: horizontal ? 'landscape' : 'portrait', margin: 40, bufferPages: true });
    doc.pipe(stream);
    const M = ReportesService.MARCA;
    const izq = doc.page.margins.left;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const PAD = 4, F_CUERPO = 8.5, F_CAB = 7.5;

    // Cabecera institucional (mismo acento de marca que la UI).
    doc.rect(0, 0, doc.page.width, 6).fill(M.acento);
    doc.fillColor(M.acento).fontSize(9).font('Helvetica-Bold').text(M.institucion.toUpperCase(), izq, 28, { characterSpacing: 1 });
    doc.fillColor('#09090B').fontSize(17).font('Helvetica-Bold').text(reporte.titulo);
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#52525B')
      .text(`${M.sistema} - generado ${new Date(reporte.generadoEn).toLocaleString('es-GT')}`);
    if (reporte.filtros?.desde || reporte.filtros?.hasta) {
      doc.text(`Periodo: ${this._fecha(reporte.filtros.desde)} a ${this._fecha(reporte.filtros.hasta)}`);
    }
    doc.moveDown(0.8);

    // --- Columnas: alineacion y ancho segun el contenido ---
    const HOLGURA = 3;   // redondeo de pdfkit: sin esto "16" se partia en "1 / 6"
    const cols = reporte.columnas.map((c, idx) => {
      const valores = reporte.filas.map(fl => this._textoCelda(fl[c.key], c));
      const numerica = c.tipo === 'moneda' || (reporte.filas.length > 0 && reporte.filas.every(fl => fl[c.key] == null || typeof fl[c.key] === 'number'));
      const fija = numerica || c.tipo === 'fecha';
      doc.font('Helvetica').fontSize(F_CUERPO);
      let natural = Math.max(0, ...valores.map(v => doc.widthOfString(v)));
      if (reporte.totales && reporte.totales[c.key] != null) {
        doc.font('Helvetica-Bold'); natural = Math.max(natural, doc.widthOfString(this._textoCelda(reporte.totales[c.key], c)));
      }
      if (reporte.totales && idx === 0 && reporte.totales[c.key] == null) {
        doc.font('Helvetica-Bold'); natural = Math.max(natural, doc.widthOfString('Total'));
      }
      doc.font('Helvetica-Bold').fontSize(F_CAB);
      // El encabezado se dibuja en mayusculas: se mide asi, palabra por palabra.
      const palabraCab = Math.max(...c.label.toUpperCase().split(/\s+/).map(p => doc.widthOfString(p)));
      const min = Math.max(palabraCab, fija ? natural : 40) + 2 * PAD + HOLGURA;
      return { ...c, numerica, fija, natural: natural + 2 * PAD + HOLGURA, min, ancho: 0 };
    });
    const fijo = cols.filter(c => c.fija).reduce((a, c) => a + c.min, 0);
    const texto = cols.filter(c => !c.fija);
    const resto = ancho - fijo;
    const deseo = texto.reduce((a, c) => a + Math.max(c.natural, c.min), 0);
    for (const c of cols) {
      if (c.fija) c.ancho = c.min;
      else c.ancho = Math.max(c.min, deseo > 0 ? resto * Math.max(c.natural, c.min) / deseo : resto / texto.length);
    }
    // Si sobra espacio (todo numerico) o falta (minimos), se reparte en proporcion.
    const suma = cols.reduce((a, c) => a + c.ancho, 0);
    if (Math.abs(suma - ancho) > 0.5) cols.forEach(c => { c.ancho = c.ancho * ancho / suma; });

    const xs = []; cols.reduce((x, c) => { xs.push(x); return x + c.ancho; }, izq);
    const limite = () => doc.page.height - doc.page.margins.bottom - 22;   // deja lugar al pie

    const altoFila = (textos, fuente, tam) => {
      doc.font(fuente).fontSize(tam);
      return Math.max(...textos.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i].ancho - 2 * PAD }))) + 2 * PAD;
    };
    const pintarFila = (textos, y, { fuente = 'Helvetica', tam = F_CUERPO, color = '#18181B', fondo = null, lineaArriba = null, lineaAbajo = '#E4E4E7' } = {}) => {
      const h = altoFila(textos, fuente, tam);
      if (fondo) doc.rect(izq, y, ancho, h).fill(fondo);
      if (lineaArriba) doc.moveTo(izq, y).lineTo(izq + ancho, y).lineWidth(1).strokeColor(lineaArriba).stroke();
      doc.font(fuente).fontSize(tam).fillColor(color);
      textos.forEach((t, i) => {
        doc.text(t || '', xs[i] + PAD, y + PAD, { width: cols[i].ancho - 2 * PAD, align: cols[i].numerica ? 'right' : 'left', lineBreak: true });
      });
      if (lineaAbajo) doc.moveTo(izq, y + h).lineTo(izq + ancho, y + h).lineWidth(lineaAbajo === '#09090B' ? 1 : 0.5).strokeColor(lineaAbajo).stroke();
      return y + h;
    };
    const encabezado = y => pintarFila(cols.map(c => c.label.toUpperCase()), y,
      { fuente: 'Helvetica-Bold', tam: F_CAB, color: '#3F3F46', fondo: '#F4F4F5', lineaAbajo: '#09090B' });

    let y = encabezado(doc.y);
    if (!reporte.filas.length) {
      doc.font('Helvetica').fontSize(F_CUERPO).fillColor('#52525B').text('Sin datos en el rango elegido.', izq + PAD, y + 8);
      y += 26;
    }
    for (const fila of reporte.filas) {
      const textos = cols.map(c => this._textoCelda(fila[c.key], c));
      const h = altoFila(textos, 'Helvetica', F_CUERPO);
      if (y + h > limite()) {               // la fila no se corta: pagina nueva con encabezado
        doc.addPage();
        y = encabezado(doc.page.margins.top);
      }
      y = pintarFila(textos, y);
    }

    if (reporte.totales) {
      const textos = cols.map((c, i) => reporte.totales[c.key] != null
        ? this._textoCelda(reporte.totales[c.key], c)
        : (i === 0 ? 'Total' : ''));
      if (y + altoFila(textos, 'Helvetica-Bold', F_CUERPO) > limite()) { doc.addPage(); y = encabezado(doc.page.margins.top); }
      pintarFila(textos, y, { fuente: 'Helvetica-Bold', color: '#09090B', fondo: '#FAFAFA', lineaArriba: '#09090B', lineaAbajo: '#09090B' });
    }

    // Pie en cada pagina.
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(rango.start + i);
      const yPie = doc.page.height - doc.page.margins.bottom - 10;
      doc.font('Helvetica').fontSize(7.5).fillColor('#71717A');
      doc.text(M.institucion, izq, yPie, { width: ancho / 2, lineBreak: false });
      doc.text(`Página ${i + 1} de ${rango.count}`, izq + ancho / 2, yPie, { width: ancho / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  }

  /** Texto de una celda del PDF: montos, fechas y codigos legibles. */
  _textoCelda(v, col) {
    if (v == null || v === '') return '';
    const t = this._formatValor(v, col.tipo);
    // Codigos internos (pendiente, entregado, dinero, cuota...) con mayuscula inicial.
    if (typeof t === 'string' && /^[a-z_]+$/.test(t)) return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/_/g, ' ');
    return String(t);
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

  /**
   * Dia de Guatemala de un valor. "YYYY-MM-DD" y las columnas DATE (que
   * llegan como medianoche UTC) se muestran tal cual; un instante (DATETIME2
   * en UTC) se pasa a UTC-6: un movimiento de las 21:00 del 3 de noviembre no
   * debe salir como 4 de noviembre.
   */
  _fecha(v) {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    const soloFecha = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    return (soloFecha ? d : new Date(d.getTime() - ReportesService.DESFASE_GT_MS)).toISOString().slice(0, 10);
  }
}

// Guatemala no usa horario de verano: medianoche local = 06:00 UTC.
ReportesService.DESFASE_GT_MS = 6 * 60 * 60 * 1000;

ReportesService.MARCA = Object.freeze({
  institucion: 'Asilo de Ancianos "Cabeza de Algodon" - Mazatenango',
  sistema: 'Sistema de Gestion Integral',
  acento: '#D11A6D'
});

module.exports = ReportesService;
