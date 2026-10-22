/**
 * Bloque 3 de la verificacion SQA: en los 7 reportes "hasta" es inclusivo
 * y los dias son de Guatemala (UTC-6). Las fechas se guardan en UTC.
 */
const ReportesService = require('../src/services/ReportesService');
const Reporte = require('../src/models/Reporte');

// Repositorio en memoria con la misma semantica que el SQL:
// fecha >= @desde AND fecha < @hasta.
const filas = [
  { id: 'antes',        fecha: new Date('2026-10-21T05:59:59Z') }, // 20 oct 23:59:59 GT
  { id: 'inicio-hoy',   fecha: new Date('2026-10-21T06:00:00Z') }, // 21 oct 00:00 GT
  { id: 'fin-hoy',      fecha: new Date('2026-10-22T05:59:59Z') }, // 21 oct 23:59:59 GT
  { id: 'manana',       fecha: new Date('2026-10-22T06:00:00Z') }  // 22 oct 00:00 GT
];
const llamadas = [];
const filtrar = args => { llamadas.push(args); return filas.filter(f => f.fecha >= args.desde && f.fecha < args.hasta); };
const repo = Object.fromEntries(['costosPorPaciente', 'analisisMedico', 'cobrosPorRango', 'pagosFundacion',
  'entradas', 'examenes', 'medicamentosAplicados'].map(m => [m, jest.fn(async a => filtrar(a))]));
const svc = new ReportesService(repo);

describe('Rango de fechas de los reportes (hasta inclusivo)', () => {
  test.each(Object.values(Reporte.TIPOS))('%s: hoy-a-hoy trae todo el dia de hoy (Guatemala) y nada mas', async tipo => {
    llamadas.length = 0;
    const r = await svc.generarReporte(tipo, { desde: '2026-10-21', hasta: '2026-10-21' });
    expect(r.filas.map(f => f.id)).toEqual(['inicio-hoy', 'fin-hoy']);
    expect(llamadas[0].desde.toISOString()).toBe('2026-10-21T06:00:00.000Z');
    expect(llamadas[0].hasta.toISOString()).toBe('2026-10-22T06:00:00.000Z');
    expect(r.filtros).toMatchObject({ desde: '2026-10-21', hasta: '2026-10-21' });
  });

  test('rango de varios dias incluye el ultimo completo', async () => {
    const r = await svc.generarReporte('pagos-fundacion', { desde: '2026-10-20', hasta: '2026-10-21' });
    expect(r.filas.map(f => f.id)).toEqual(['antes', 'inicio-hoy', 'fin-hoy']);
  });
});
