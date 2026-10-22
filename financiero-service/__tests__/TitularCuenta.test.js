/**
 * Caso 20 del plan del SQA: no entran movimientos a la cuenta si el
 * familiar responsable (titular) no existe o tiene datos incompletos.
 */
const FinancieroService = require('../src/services/FinancieroService');

const COMPLETO = { id: 3, nombres: 'Ana', apellidos: 'G', dpi: '1234567890123', parentesco: 'hija',
                   telefono: '55551234', email: 'a@example.com', direccion: 'Zona 1' };
function nuevo(familiar) {
  const cuentaRepo = {
    guardarCargo: jest.fn(async c => ({ ...c, id: 1 })),
    obtenerCuota: jest.fn(async () => null), guardarCuota: jest.fn(), pagarCuota: jest.fn()
  };
  return { svc: new FinancieroService(cuentaRepo, {}, {}, { obtenerPrincipal: jest.fn(async () => familiar) }), cuentaRepo };
}

describe('Titular de la cuenta (caso 20)', () => {
  test('cargo manual: queda a nombre del familiar responsable', async () => {
    const { svc, cuentaRepo } = nuevo(COMPLETO);
    await svc.generarCargo({ idPaciente: 1, concepto: 'Panales', monto: 50 });
    expect(cuentaRepo.guardarCargo).toHaveBeenCalledWith(expect.objectContaining({ idFamiliar: 3 }));
  });

  test('cargo a un paciente sin familiar responsable -> 409 y no se guarda', async () => {
    const { svc, cuentaRepo } = nuevo(null);
    await expect(svc.generarCargo({ idPaciente: 1, concepto: 'Panales', monto: 50 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/no tiene familiar responsable/) });
    expect(cuentaRepo.guardarCargo).not.toHaveBeenCalled();
  });

  test('cuota con familiar incompleto -> 409 con los campos que faltan', async () => {
    const { svc, cuentaRepo } = nuevo({ ...COMPLETO, email: '', dpi: null });
    await expect(svc.registrarPagoCuota({ idPaciente: 1, mes: 10, anio: 2026, monto: 800 }))
      .rejects.toMatchObject({ status: 409, camposFaltantes: ['dpi', 'email'] });
    expect(cuentaRepo.guardarCuota).not.toHaveBeenCalled();
  });
});
