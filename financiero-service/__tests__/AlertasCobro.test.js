/**
 * Caso 21 del plan del SQA: alertas de cobro naranja / roja por saldo y
 * por cuotas vencidas, y panel de cuentas con alerta (rojas primero).
 */
const { evaluarAlerta, diasMora, vencimientoPorDefecto, hoyGuatemala } = require('../src/services/alertasCobro');
const FinancieroService = require('../src/services/FinancieroService');

const config = { umbralRoja: 1000, umbralNaranja: 500, diasMoraRoja: 30 };
const cuota = (mes, anio, extra = {}) => ({ idPaciente: 1, mes, anio, monto: 800, estado: 'pendiente', ...extra });

describe('Alertas de cobro (caso 21)', () => {
  test('la cuota vence el ultimo dia de su mes; mora desde el dia siguiente', () => {
    expect(vencimientoPorDefecto(2, 2028)).toBe('2028-02-29');
    expect(vencimientoPorDefecto(12, 2026)).toBe('2026-12-31');
    expect(diasMora(cuota(9, 2026), '2026-09-30')).toBe(0);
    expect(diasMora(cuota(9, 2026), '2026-10-01')).toBe(1);
    expect(diasMora(cuota(9, 2026, { estado: 'pagada' }), '2026-12-01')).toBe(0);
    expect(diasMora(cuota(9, 2026, { fechaVencimiento: '2026-10-10' }), '2026-10-21')).toBe(11);
  });

  test('cuota vencida hace pocos dias -> naranja aunque el saldo sea bajo', () => {
    const a = evaluarAlerta({ saldoTotal: 300, cuotas: [cuota(9, 2026, { monto: 300 })], hoy: '2026-10-21', config });
    expect(a).toMatchObject({ nivel: 'naranja', cuotasVencidas: 1, diasMoraMax: 21 });
    expect(a.mensaje).toMatch(/9\/2026 \(21 d\)/);
  });

  test('cuota con mas de 30 dias de mora -> roja', () => {
    const a = evaluarAlerta({ saldoTotal: 300, cuotas: [cuota(8, 2026, { monto: 300 })], hoy: '2026-10-21', config });
    expect(a).toMatchObject({ nivel: 'roja', diasMoraMax: 51 });
  });

  test('saldo sobre el umbral -> roja aunque no haya cuotas vencidas', () => {
    expect(evaluarAlerta({ saldoTotal: 1000, cuotas: [], hoy: '2026-10-21', config }).nivel).toBe('roja');
  });

  test('saldo entre la mitad y el umbral -> naranja; cuota del mes en curso no vencida -> sin alerta', () => {
    expect(evaluarAlerta({ saldoTotal: 500, hoy: '2026-10-21', config }).nivel).toBe('naranja');
    expect(evaluarAlerta({ saldoTotal: 400, cuotas: [cuota(10, 2026, { monto: 400 })], hoy: '2026-10-21', config })).toBeNull();
  });

  test('el nivel mas alto gana y se listan todos los motivos', () => {
    const a = evaluarAlerta({ saldoTotal: 600, cuotas: [cuota(7, 2026, { monto: 300 })], hoy: '2026-10-21', config });
    expect(a.nivel).toBe('roja');
    expect(a.motivos).toHaveLength(2);
  });

  test('hoy en Guatemala (UTC-6): a las 02:00 UTC todavia es el dia anterior', () => {
    expect(hoyGuatemala(Date.parse('2026-10-22T02:00:00Z'))).toBe('2026-10-21');
  });

  test('panel: solo cuentas con alerta, rojas primero', async () => {
    const cuentaRepo = {
      cuentasPorCobrar: jest.fn(async () => [
        { idPaciente: 1, paciente: 'A', activo: true, saldoCargos: 100, saldoCuotas: 0, cuotas: [] },
        { idPaciente: 2, paciente: 'B', activo: true, saldoCargos: 0, saldoCuotas: 300, cuotas: [cuota(9, 2026, { idPaciente: 2, monto: 300 })] },
        { idPaciente: 3, paciente: 'C', activo: true, saldoCargos: 1200, saldoCuotas: 0, cuotas: [] }
      ])
    };
    process.env.UMBRAL_ALERTA_SALDO = '1000';
    const svc = new FinancieroService(cuentaRepo, {}, {}, {});
    svc.hoy = () => '2026-10-21';
    const r = await svc.alertasCobro();
    expect(r.map(x => [x.idPaciente, x.alerta.nivel])).toEqual([[3, 'roja'], [2, 'naranja']]);
  });

  test('emitir cuota: pendiente con vencimiento a fin de mes; duplicada -> 409; titular incompleto -> 409', async () => {
    const familiar = { id: 3, nombres: 'Ana', apellidos: 'G', dpi: '1234567890123', parentesco: 'hija',
                       telefono: '55551234', email: 'a@example.com', direccion: 'Zona 1' };
    let existente = null;
    const cuentaRepo = {
      obtenerCuota: jest.fn(async () => existente),
      guardarCuota: jest.fn(async c => ({ ...c, id: 7 }))
    };
    const familiarRepo = { obtenerPrincipal: jest.fn(async () => familiar) };
    const svc = new FinancieroService(cuentaRepo, {}, {}, familiarRepo);
    const c = await svc.emitirCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 800 });
    expect(c).toMatchObject({ estado: 'pendiente', fechaVencimiento: '2026-09-30' });
    await expect(svc.emitirCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.emitirCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 5, fechaVencimiento: '30/09/2026' }))
      .rejects.toMatchObject({ status: 400 });
    existente = c;
    await expect(svc.emitirCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 800 })).rejects.toMatchObject({ status: 409 });
    familiarRepo.obtenerPrincipal.mockResolvedValueOnce({ ...familiar, direccion: '' });
    existente = null;
    await expect(svc.emitirCuota({ idPaciente: 1, mes: 10, anio: 2026, monto: 800 })).rejects.toMatchObject({ status: 409 });
  });
});
