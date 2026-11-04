/**
 * Caso 22 del SQA ("el PDF aparece todo revuelto; los numeros no estan
 * tabulados"). Se genera un PDF de 130 filas y se lee con pdf.js:
 * encabezado en una linea y repetido en cada pagina, montos completos y
 * alineados a la derecha, filas sin cortar, totales y pie "Pagina N de M".
 */
const path = require('path');
const { PassThrough } = require('stream');
const ReportesService = require('../src/services/ReportesService');
const Reporte = require('../src/models/Reporte');
const pdfjs = require(path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.js'));

const svc = new ReportesService({});
async function pdfDe(reporte) {
  const s = new PassThrough(); const partes = [];
  s.on('data', c => partes.push(c));
  const fin = new Promise(r => s.on('end', r));
  await svc.exportarPDF(reporte, s);
  await fin;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(partes)), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    paginas.push(tc.items.filter(it => it.str.trim()).map(it => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  return { paginas, ancho: (await doc.getPage(1)).getViewport({ scale: 1 }).width };
}

const columnas = [
  { key: 'idPaciente', label: 'ID' }, { key: 'paciente', label: 'Paciente' }, { key: 'dpi', label: 'DPI' },
  { key: 'consulta', label: 'Consulta (Q)', tipo: 'moneda' }, { key: 'laboratorio', label: 'Laboratorio (Q)', tipo: 'moneda' },
  { key: 'farmacia', label: 'Farmacia (Q)', tipo: 'moneda' }, { key: 'totalGeneral', label: 'Total (Q)', tipo: 'moneda' }
];
const filas = Array.from({ length: 130 }, (_, i) => ({
  idPaciente: i + 1, paciente: `Paciente de prueba con nombre largo número ${i + 1}`, dpi: String(1000000000000 + i),
  consulta: 120, laboratorio: i % 3 ? 160 : 0, farmacia: 1234.5, totalGeneral: 120 + (i % 3 ? 160 : 0) + 1234.5
}));
const reporte = new Reporte({ tipo: 'costos-por-paciente', titulo: 'Costos por paciente', columnas, filas,
  totales: { consulta: 15600, laboratorio: 13920, farmacia: 160485, totalGeneral: 190005 }, filtros: { desde: '2026-10-01', hasta: '2026-10-31' } });

describe('PDF con tabla (caso 22)', () => {
  let pdf;
  beforeAll(async () => { pdf = await pdfDe(reporte); }, 30000);

  test('varias páginas, horizontal, con el encabezado repetido en cada una y en una sola línea', () => {
    expect(pdf.paginas.length).toBeGreaterThan(1);
    expect(pdf.ancho).toBeGreaterThan(700);           // carta horizontal (792 pt)
    for (const pag of pdf.paginas) {
      const cab = ['ID', 'PACIENTE', 'DPI', 'CONSULTA', 'LABORATORIO', 'FARMACIA', 'TOTAL'].map(p => pag.find(i => i.s.split(/\s+/)[0] === p));
      expect(cab.every(Boolean)).toBe(true);
      const ys = cab.map(i => i.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    }
  });

  test('montos completos ("Q 1,234.50" en una pieza) y alineados a la derecha por columna', () => {
    const todos = pdf.paginas.flat();
    expect(todos.some(i => i.s === 'Q')).toBe(false);
    const montos = todos.filter(i => i.s === 'Q 1,234.50');
    expect(montos.length).toBe(130);
    const bordes = new Set(montos.map(i => Math.round(i.x + i.w)));
    expect(bordes.size).toBe(1);                       // misma columna, mismo borde derecho
  });

  test('ninguna fila se corta ni se pierde: los 130 ID aparecen una vez', () => {
    const ids = pdf.paginas.flat().filter(i => /^\d{1,3}$/.test(i.s) && i.x < 80).map(i => Number(i.s));
    expect(new Set(ids).size).toBe(130);
  });

  test('fila de totales y pie con número de página', () => {
    const ultima = pdf.paginas[pdf.paginas.length - 1];
    expect(ultima.some(i => i.s === 'Total')).toBe(true);
    expect(ultima.some(i => i.s === 'Q 190,005.00')).toBe(true);
    pdf.paginas.forEach((pag, n) => expect(pag.some(i => i.s === `Página ${n + 1} de ${pdf.paginas.length}`)).toBe(true));
  });

  test('nada se sale del margen derecho', () => {
    expect(pdf.paginas.flat().filter(i => i.x + i.w > pdf.ancho - 20)).toEqual([]);
  });
});

describe('_fecha: día de Guatemala', () => {
  test('instante de la noche del 3 de noviembre (UTC 4 nov) -> 2026-11-03; DATE y texto, tal cual', () => {
    expect(svc._fecha('2026-11-04T03:30:00.000Z')).toBe('2026-11-03');
    expect(svc._fecha(new Date('2026-11-04T00:00:00.000Z'))).toBe('2026-11-04');
    expect(svc._fecha('2026-10-01')).toBe('2026-10-01');
  });
});
