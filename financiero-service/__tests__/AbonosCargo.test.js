/**
 * Caso 20 del plan del SQA: control de saldos. Un abono nunca deja el
 * saldo del cargo negativo; se rechaza en vez de truncarse.
 */
const FinancieroService = require('../src/services/FinancieroService');
const CargoServicio = require('../src/models/CargoServicio');

function nuevo(cargo, resultadoRepo) {
  const cuentaRepo = {
    obtenerCargo: jest.fn(async () => (cargo ? new CargoServicio(cargo) : null)),
    registrarAbono: jest.fn(async (id, { monto }) => (resultadoRepo === undefined
      ? { cargo: new CargoServicio({ ...cargo, montoPagado: (cargo.montoPagado || 0) + monto,
          estado: (cargo.montoPagado || 0) + monto >= cargo.monto ? 'pagado' : 'parcial' }),
          abono: { id: 9, idCargo: id, monto } }
      : resultadoRepo))
  };
  return { svc: new FinancieroService(cuentaRepo, {}, {}), cuentaRepo };
}
const cargo = { id: 5, idPaciente: 1, concepto: 'Visita', monto: 120, montoPagado: 0, estado: 'pendiente' };

describe('Abonos a cargos (caso 20)', () => {

  test('abono parcial: estado parcial y saldo restante', async () => {
    const { svc } = nuevo(cargo);
    const r = await svc.registrarAbono(5, { monto: 50 });
    expect(r).toMatchObject({ estado: 'parcial', montoPagado: 50, saldo: 70 });
  });

  test('abono por el saldo exacto: pagado y saldo 0', async () => {
    const { svc } = nuevo({ ...cargo, montoPagado: 70, estado: 'parcial' });
    const r = await svc.registrarAbono(5, { monto: 50 });
    expect(r).toMatchObject({ estado: 'pagado', saldo: 0 });
  });

  test('abono mayor que el saldo -> 409 y no se escribe (no hay saldos negativos)', async () => {
    const { svc, cuentaRepo } = nuevo({ ...cargo, montoPagado: 100, estado: 'parcial' });
    await expect(svc.registrarAbono(5, { monto: 20.01 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/excede el saldo.*negativos/) });
    expect(cuentaRepo.registrarAbono).not.toHaveBeenCalled();
  });

  test('abono a un cargo pagado -> 409', async () => {
    const { svc } = nuevo({ ...cargo, montoPagado: 120, estado: 'pagado' });
    await expect(svc.registrarAbono(5, { monto: 1 })).rejects.toMatchObject({ status: 409 });
  });

  test('monto 0, negativo o con mas de 2 decimales -> 400', async () => {
    const { svc } = nuevo(cargo);
    for (const monto of [0, -5, 1.005, 'abc']) {
      await expect(svc.registrarAbono(5, { monto })).rejects.toMatchObject({ status: 400 });
    }
  });

  test('carrera: el UPDATE condicionado no aplica -> 409', async () => {
    const { svc } = nuevo(cargo, null);
    await expect(svc.registrarAbono(5, { monto: 100 })).rejects.toMatchObject({ status: 409 });
  });

  test('cargo inexistente -> 404', async () => {
    await expect(nuevo(null).svc.registrarAbono(99, { monto: 1 })).rejects.toMatchObject({ status: 404 });
  });
});
