/**
 * Borrado logico de donantes en FinancieroService.
 */
const FinancieroService = require('../src/services/FinancieroService');

function nuevo(donante) {
  const donRepo = {
    obtenerDonante: jest.fn(async () => donante),
    guardarDonacion: jest.fn(async d => ({ ...d, id: 1 })),
    listarDonantes: jest.fn(async () => []),
    cambiarActivoDonante: jest.fn(async (id, activo) => ({ ...donante, id, activo }))
  };
  return { svc: new FinancieroService({}, donRepo, {}), donRepo };
}

describe('FinancieroService — donantes desactivados', () => {

  test('donacion a donante desactivado -> 409 y no se guarda', async () => {
    const { svc, donRepo } = nuevo({ id: 3, nombre: 'Fundacion X', activo: false });
    await expect(svc.registrarDonacion({ idDonante: 3, monto: 100 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Fundacion X esta desactivado/) });
    expect(donRepo.guardarDonacion).not.toHaveBeenCalled();
  });

  test('desactivar donante activo -> cambiarActivoDonante(id, false)', async () => {
    const { svc, donRepo } = nuevo({ id: 3, nombre: 'Fundacion X', activo: true });
    await svc.desactivarDonante(3);
    expect(donRepo.cambiarActivoDonante).toHaveBeenCalledWith(3, false);
  });

  test('reactivar donante activo -> 409; inexistente -> 404', async () => {
    await expect(nuevo({ id: 3, activo: true }).svc.reactivarDonante(3)).rejects.toMatchObject({ status: 409 });
    await expect(nuevo(null).svc.desactivarDonante(9)).rejects.toMatchObject({ status: 404 });
  });

  test('listarDonantes pasa incluirInactivos (por defecto false)', async () => {
    const { svc, donRepo } = nuevo(null);
    await svc.listarDonantes();
    expect(donRepo.listarDonantes).toHaveBeenCalledWith({ incluirInactivos: false });
  });
});
