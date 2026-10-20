/**
 * Pruebas unitarias de FinancieroService para salidas de caja: gastos
 * operativos y pagos a la fundacion.
 */
const FinancieroService = require('../src/services/FinancieroService');

function nuevoServicio() {
  const movRepo = {
    guardarGasto: jest.fn(async g => ({ ...g, id: 1 })),
    guardarPagoFundacion: jest.fn(async p => ({ ...p, id: 1 }))
  };
  return { svc: new FinancieroService({}, {}, movRepo), movRepo };
}

describe('FinancieroService — gastos y pagos a fundacion', () => {

  test('registrarGasto sin concepto -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.registrarGasto({ monto: 10 })).rejects.toMatchObject({ status: 400 });
  });

  test('registrarGasto con categoria invalida -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.registrarGasto({ concepto: 'Luz', monto: 10, categoria: 'lujos' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('registrarGasto sin categoria usa "otros"', async () => {
    const { svc, movRepo } = nuevoServicio();
    await svc.registrarGasto({ concepto: 'Luz', monto: '350.5' });
    expect(movRepo.guardarGasto).toHaveBeenCalledWith(
      expect.objectContaining({ concepto: 'Luz', monto: 350.5, categoria: 'otros' }));
  });

  test('registrarPagoFundacion con monto 0 -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.registrarPagoFundacion({ concepto: 'Octubre', monto: 0 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('registrarPagoFundacion OK', async () => {
    const { svc, movRepo } = nuevoServicio();
    await svc.registrarPagoFundacion({ concepto: 'Octubre', monto: 3500 });
    expect(movRepo.guardarPagoFundacion).toHaveBeenCalledWith(
      expect.objectContaining({ concepto: 'Octubre', monto: 3500 }));
  });
});
