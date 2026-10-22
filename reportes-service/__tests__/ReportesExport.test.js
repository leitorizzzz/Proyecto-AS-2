/**
 * Casos 22 y 23 del plan del SQA en reportes-service:
 *  - el Excel lleva formulas reales (SUM de totales y suma por fila) y la
 *    cabecera institucional; el PDF se genera con contenido.
 *  - los filtros con texto malicioso se rechazan con 400 antes de la BD.
 */
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const ReportesService = require('../src/services/ReportesService');

const filasCostos = [
  { idPaciente: 1, paciente: 'Rosa Gomez', dpi: '1111111110101', consulta: 120, laboratorio: 68, farmacia: 1.92, otros: 0, totalGeneral: 189.92 },
  { idPaciente: 2, paciente: 'Pedro Lopez', dpi: '2222222220101', consulta: 120, laboratorio: 0, farmacia: 0, otros: 450, totalGeneral: 570 }
];
const repo = {
  costosPorPaciente: jest.fn(async () => filasCostos),
  medicamentosAplicados: jest.fn(async () => [])
};
const svc = new ReportesService(repo);

async function aBuffer(fn) {
  const s = new PassThrough();
  const partes = [];
  s.on('data', d => partes.push(d));
  const fin = new Promise(r => s.on('end', r));
  await fn(s);
  await fin;
  return Buffer.concat(partes);
}

describe('Exportacion de reportes (caso 22)', () => {
  test('Excel: totales con SUM, total por fila con formula y cabecera institucional', async () => {
    const reporte = await svc.generarReporte('costos-por-paciente', { desde: '2026-10-01', hasta: '2026-10-31' });
    const buf = await aBuffer(s => svc.exportarExcel(reporte, s));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A1').value)).toMatch(/CABEZA DE ALGODON/);
    expect(ws.getCell('A2').value).toBe('Costos por paciente');
    // Cabecera en la fila 5, datos en 6 y 7, totales en 8. Columna H = Total.
    expect(ws.getCell('A5').value).toBe('ID');
    expect(ws.getCell('H6').value).toMatchObject({ formula: 'D6+E6+F6+G6', result: 189.92 });
    expect(ws.getCell('H7').value).toMatchObject({ formula: 'D7+E7+F7+G7', result: 570 });
    expect(ws.getCell('A8').value).toBe('Total');
    expect(ws.getCell('D8').value).toMatchObject({ formula: 'SUM(D6:D7)', result: 240 });
    expect(ws.getCell('H8').value).toMatchObject({ formula: 'SUM(H6:H7)', result: 759.92 });
    expect(ws.getCell('D6').numFmt).toBe('"Q"#,##0.00');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
  });

  test('Excel sin filas: total 0 sin formula invalida', async () => {
    const reporte = await svc.generarReporte('medicamentos-aplicados', {});
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await aBuffer(s => svc.exportarExcel(reporte, s)));
    const ws = wb.worksheets[0];
    expect(ws.getCell('A6').value).toBe('Total');
    expect(ws.getCell('E6').value).toBe(0);
  });

  test('costos por paciente: el total es la suma de los rubros (sin contar farmacia dos veces)', async () => {
    const r = await svc.generarReporte('costos-por-paciente', {});
    expect(r.columnas.map(c => c.key)).toEqual(['idPaciente', 'paciente', 'dpi', 'consulta', 'laboratorio', 'farmacia', 'otros', 'totalGeneral']);
    expect(r.totales).toMatchObject({ consulta: 240, laboratorio: 68, farmacia: 1.92, otros: 450, totalGeneral: 759.92 });
  });

  test('PDF: se genera un documento no vacio', async () => {
    const reporte = await svc.generarReporte('costos-por-paciente', {});
    const buf = await aBuffer(s => svc.exportarPDF(reporte, s));
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe('Entradas maliciosas en reportes (caso 23)', () => {
  test.each([
    ["2026-01-01' OR '1'='1"],
    ['2026-01-01; DROP TABLE pacientes;--'],
    ['2026-02-30'],
    ['01/10/2026']
  ])('desde=%s -> 400 sin consultar la BD', async desde => {
    repo.costosPorPaciente.mockClear();
    await expect(svc.generarReporte('costos-por-paciente', { desde })).rejects.toMatchObject({ status: 400 });
    expect(repo.costosPorPaciente).not.toHaveBeenCalled();
  });

  test('idPaciente no entero (p. ej. "1 OR 1=1" -> NaN) -> 400', async () => {
    await expect(svc.generarReporte('costos-por-paciente', { idPaciente: Number('1 OR 1=1') }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('tipo de reporte con SQL -> 400', async () => {
    await expect(svc.generarReporte("examenes' OR 1=1--", {})).rejects.toMatchObject({ status: 400 });
  });

  test('desde posterior a hasta -> 400', async () => {
    await expect(svc.generarReporte('costos-por-paciente', { desde: '2026-10-31', hasta: '2026-10-01' }))
      .rejects.toMatchObject({ status: 400 });
  });
});
