/**
 * Caso 21 del SQA ("indicador naranja/roja ... por cuota en estado
 * vencida"): la cuota pendiente cuya fecha paso queda en estado 'vencida',
 * hay una alerta por cuota con familiar, paciente, monto y dias de mora, y al
 * pagarse pasa a 'pagada'.
 */
process.env.DIAS_MORA_ROJA = '30';
const FinancieroService = require('../src/services/FinancieroService');
const alertasCobro = require('../src/services/alertasCobro');

const familiarCompleto = { id: 3, nombres: 'Ana', apellidos: 'G', dpi: '1234567890123', parentesco: 'hija',
  telefono: '5555', email: 'a@example.com', direccion: 'Zona 1' };

function servicio({ vencidas = [], cuota = null } = {}) {
  const cuentaRepo = {
    marcarVencidas: jest.fn(async () => 2),
    cuotasVencidas: jest.fn(async () => vencidas),
    obtenerCuota: jest.fn(async () => cuota),
    guardarCuota: jest.fn(async c => ({ ...c, id: 9 })),
    pagarCuota: jest.fn(async id => ({ id, estado: 'pagada' }))
  };
  const familiarRepo = { obtenerPrincipal: jest.fn(async () => familiarCompleto), existePaciente: jest.fn(async () => true) };
  const svc = new FinancieroService(cuentaRepo, {}, {}, familiarRepo);
  svc.hoy = () => '2026-11-03';
  return { svc, cuentaRepo };
}

describe('Cuotas vencidas (caso 21)', () => {
  test('marcarCuotasVencidas usa el día de Guatemala', async () => {
    const { svc, cuentaRepo } = servicio();
    expect(await svc.marcarCuotasVencidas()).toBe(2);
    expect(cuentaRepo.marcarVencidas).toHaveBeenCalledWith('2026-11-03');
  });

  test('una alerta por cuota: roja con más de 30 días de mora, naranja con menos; rojas primero', async () => {
    const { svc } = servicio({ vencidas: [
      { idCuota: 1, idPaciente: 4, mes: 10, anio: 2026, monto: 800, fechaVencimiento: '2026-10-25', nombres: 'Rosa', apellidos: 'G', famNombres: 'Carmen', famApellidos: 'G', parentesco: 'hija' },
      { idCuota: 2, idPaciente: 5, mes: 8, anio: 2026, monto: 850, fechaVencimiento: '2026-09-19', nombres: 'Pedro', apellidos: 'L', famNombres: 'Luis', famApellidos: 'L', parentesco: 'hijo' }
    ] });
    const r = await svc.alertasPorCuota();
    expect(r.map(x => [x.idCuota, x.nivel, x.diasMora])).toEqual([[2, 'roja', 45], [1, 'naranja', 9]]);
    expect(r[0]).toMatchObject({ familiar: 'Luis L', paciente: 'Pedro L', monto: 850, fechaVencimiento: '2026-09-19' });
  });

  test('emitir una cuota con vencimiento pasado la deja vencida; con vencimiento futuro, pendiente', async () => {
    const { svc, cuentaRepo } = servicio();
    await svc.emitirCuota({ idPaciente: 1, mes: 8, anio: 2026, monto: 850, fechaVencimiento: '2026-09-19' });
    expect(cuentaRepo.guardarCuota.mock.calls[0][0].estado).toBe('vencida');
    await svc.emitirCuota({ idPaciente: 1, mes: 12, anio: 2026, monto: 850, fechaVencimiento: '2026-12-31' });
    expect(cuentaRepo.guardarCuota.mock.calls[1][0].estado).toBe('pendiente');
  });

  test('una cuota vencida se puede pagar y pasa a pagada', async () => {
    const { svc, cuentaRepo } = servicio({ cuota: { id: 7, mes: 8, anio: 2026, estado: 'vencida' } });
    await expect(svc.registrarPagoCuota({ idPaciente: 1, mes: 8, anio: 2026 })).resolves.toMatchObject({ estado: 'pagada' });
    expect(cuentaRepo.pagarCuota).toHaveBeenCalledWith(7);
  });

  test('la mora cuenta también para el estado vencida', () => {
    expect(alertasCobro.diasMora({ estado: 'vencida', fechaVencimiento: '2026-10-01', mes: 9, anio: 2026 }, '2026-11-03')).toBe(33);
    expect(alertasCobro.diasMora({ estado: 'pagada', fechaVencimiento: '2026-10-01' }, '2026-11-03')).toBe(0);
  });
});
