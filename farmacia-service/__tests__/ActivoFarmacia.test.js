/**
 * Borrado logico en farmacia: no se dispensa a pacientes desactivados ni
 * medicamentos desactivados; desactivar / reactivar medicamento.
 */
const FarmaciaService = require('../src/services/FarmaciaService');
const Medicamento = require('../src/models/Medicamento');
const Prescripcion = require('../src/models/Prescripcion');

function nuevo({ medicamento, prescripcion }) {
  const medRepo = {
    obtenerPorId: jest.fn(async () => medicamento || null),
    actualizarStock: jest.fn(async () => {}),
    obtenerTodos: jest.fn(async () => []),
    cambiarActivo: jest.fn(async (id, activo) => new Medicamento({ ...medicamento, id, activo }))
  };
  const dispRepo = { guardar: jest.fn(async d => ({ ...d, id: 1 })) };
  const presRepo = {
    obtenerPorId: jest.fn(async () => prescripcion || null),
    marcarDispensada: jest.fn(async () => {})
  };
  return { svc: new FarmaciaService(medRepo, dispRepo, presRepo), medRepo, dispRepo };
}

const rx = extra => new Prescripcion({
  id: 1, idVisita: 1, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan', estado: 'pendiente', ...extra
});
const losartan = extra => new Medicamento({ id: 2, nombre: 'Losartan', stock: 100, precioUnitario: 1.2, ...extra });

describe('FarmaciaService — borrado logico', () => {

  test('dispensar a paciente desactivado -> 409 y no toca inventario', async () => {
    const { svc, medRepo, dispRepo } = nuevo({ prescripcion: rx({ pacienteActivo: false }), medicamento: losartan() });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/paciente 10 esta desactivado/) });
    expect(medRepo.actualizarStock).not.toHaveBeenCalled();
    expect(dispRepo.guardar).not.toHaveBeenCalled();
  });

  test('dispensar un medicamento desactivado -> 409', async () => {
    const { svc, medRepo } = nuevo({ prescripcion: rx(), medicamento: losartan({ activo: false }) });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/desactivado en el inventario/) });
    expect(medRepo.actualizarStock).not.toHaveBeenCalled();
  });

  test('desactivar medicamento activo -> cambiarActivo(id, false)', async () => {
    const { svc, medRepo } = nuevo({ medicamento: losartan() });
    const r = await svc.desactivarMedicamento(2);
    expect(medRepo.cambiarActivo).toHaveBeenCalledWith(2, false);
    expect(r.activo).toBe(false);
  });

  test('desactivar medicamento ya desactivado -> 409; reactivar uno activo -> 409', async () => {
    await expect(nuevo({ medicamento: losartan({ activo: false }) }).svc.desactivarMedicamento(2))
      .rejects.toMatchObject({ status: 409 });
    await expect(nuevo({ medicamento: losartan() }).svc.reactivarMedicamento(2))
      .rejects.toMatchObject({ status: 409 });
  });

  test('listarMedicamentos pasa incluirInactivos (por defecto false)', async () => {
    const { svc, medRepo } = nuevo({});
    await svc.listarMedicamentos();
    expect(medRepo.obtenerTodos).toHaveBeenCalledWith({ incluirInactivos: false });
  });
});
