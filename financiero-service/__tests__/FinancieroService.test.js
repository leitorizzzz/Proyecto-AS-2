/**
 * Pruebas unitarias de FinancieroService.
 * Cubren: alerta de saldo (umbral configurable), creacion de cargo,
 * flujo registrarPagoCuota (crea cuota si no existe y la paga; segunda
 * vez -> 409).
 */
const FinancieroService = require('../src/services/FinancieroService');

function nuevoServicio({ cargos = [], cuotas = [], saldoCargos = 0, saldoCuotas = 0,
                        cuotaExistente = null, umbral = 1000 } = {}) {
  process.env.UMBRAL_ALERTA_SALDO = String(umbral);
  const cuentaRepo = {
    listarCargosPorPaciente: jest.fn(async () => cargos),
    cuotasPorPaciente: jest.fn(async () => cuotas),
    saldoPendientePorPaciente: jest.fn(async () => saldoCargos),
    saldoCuotasPendientes: jest.fn(async () => saldoCuotas),
    guardarCargo: jest.fn(async c => ({ ...c, id: 1 })),
    obtenerCuota: jest.fn(async () => cuotaExistente),
    guardarCuota: jest.fn(async c => ({ ...c, id: 1, estado: 'pendiente' })),
    pagarCuota: jest.fn(async id => ({ id, estado: 'pagada', fechaPago: new Date() }))
  };
  const donRepo = {};
  const movRepo = {};
  return { svc: new FinancieroService(cuentaRepo, donRepo, movRepo), cuentaRepo };
}

describe('FinancieroService', () => {

  test('alerta nivel bajo cuando saldo > 0 y < umbral', async () => {
    const { svc } = nuevoServicio({ saldoCargos: 450, saldoCuotas: 0, umbral: 1000 });
    const r = await svc.estadoCuenta(1);
    expect(r.saldoTotal).toBe(450);
    expect(r.alerta?.nivel).toBe('bajo');
  });

  test('alerta nivel alto cuando saldo >= umbral', async () => {
    const { svc } = nuevoServicio({ saldoCargos: 800, saldoCuotas: 300, umbral: 1000 });
    const r = await svc.estadoCuenta(1);
    expect(r.saldoTotal).toBe(1100);
    expect(r.alerta?.nivel).toBe('alto');
    expect(r.alerta.mensaje).toMatch(/supera el umbral/i);
  });

  test('sin alerta cuando saldo = 0', async () => {
    const { svc } = nuevoServicio({ saldoCargos: 0, saldoCuotas: 0 });
    const r = await svc.estadoCuenta(1);
    expect(r.saldoTotal).toBe(0);
    expect(r.alerta).toBeNull();
  });

  test('generarCargo valida monto > 0', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.generarCargo({ idPaciente: 1, concepto: 'x', monto: 0 }))
      .rejects.toMatchObject({ status: 400 });
    await expect(svc.generarCargo({ idPaciente: 1, concepto: '', monto: 50 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('generarCargo OK crea cargo pendiente', async () => {
    const { svc, cuentaRepo } = nuevoServicio();
    await svc.generarCargo({ idPaciente: 1, concepto: 'consulta', monto: 150 });
    expect(cuentaRepo.guardarCargo).toHaveBeenCalled();
  });

  test('registrarPagoCuota crea cuota nueva y la marca pagada', async () => {
    const { svc, cuentaRepo } = nuevoServicio();
    await svc.registrarPagoCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 800 });
    expect(cuentaRepo.guardarCuota).toHaveBeenCalled();
    expect(cuentaRepo.pagarCuota).toHaveBeenCalled();
  });

  test('registrarPagoCuota sobre cuota ya pagada -> 409', async () => {
    const { svc } = nuevoServicio({
      cuotaExistente: { id: 1, idPaciente: 1, mes: 9, anio: 2026, monto: 800, estado: 'pagada' }
    });
    await expect(svc.registrarPagoCuota({ idPaciente: 1, mes: 9, anio: 2026, monto: 800 }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('registrarPagoCuota mes invalido -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.registrarPagoCuota({ idPaciente: 1, mes: 13, anio: 2026, monto: 800 }))
      .rejects.toMatchObject({ status: 400 });
  });
});
