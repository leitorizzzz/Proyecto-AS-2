/**
 * Pruebas unitarias de FarmaciaService.
 * Cubren RN-06 (prescripcion valida antes de dispensar) y RN-09
 * (20% de descuento fundacion).
 */
const FarmaciaService = require('../src/services/FarmaciaService');
const Medicamento = require('../src/models/Medicamento');
const Prescripcion = require('../src/models/Prescripcion');

function nuevoServicio({ medicamento, prescripcion } = {}) {
  const medRepo = {
    obtenerPorId: jest.fn(async () => medicamento || null),
    actualizarStock: jest.fn(async () => {}),
    obtenerTodos: jest.fn(async () => [])
  };
  const dispRepo = {
    guardar: jest.fn(async d => ({ ...d, id: 1 })),
    obtenerPorPaciente: jest.fn(async () => [])
  };
  const presRepo = {
    obtenerPorId: jest.fn(async () => prescripcion || null),
    listarPendientesPorPaciente: jest.fn(async () => prescripcion ? [prescripcion] : []),
    marcarDispensada: jest.fn(async () => {})
  };
  return { svc: new FarmaciaService(medRepo, dispRepo, presRepo), medRepo, dispRepo, presRepo };
}

describe('FarmaciaService', () => {

  test('RN-09: calcularCosto aplica 20% de descuento', () => {
    const { svc } = nuevoServicio();
    expect(svc.calcularCosto(10, 2)).toBe(16);   // 20 * 0.8
    expect(svc.calcularCosto(1.20, 1)).toBe(0.96);
    expect(svc.calcularCosto(0, 5)).toBe(0);
  });

  test('RN-06: dispensar sin idPrescripcion -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.dispensarMedicamento({ cantidad: 1 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/RN-06/i) });
  });

  test('RN-06: prescripcion inexistente -> 404', async () => {
    const { svc } = nuevoServicio({ prescripcion: null });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 99, cantidad: 1 }))
      .rejects.toMatchObject({ status: 404 });
  });

  test('RN-06: prescripcion ya dispensada -> 409', async () => {
    const prescripcion = new Prescripcion({
      id: 1, idVisita: 1, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan',
      estado: 'dispensada'
    });
    const { svc } = nuevoServicio({ prescripcion });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1 }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('RN-06: prescripcion sin idMedicamento -> 400', async () => {
    const prescripcion = new Prescripcion({
      id: 1, idVisita: 1, idPaciente: 10, idMedicamento: null, medicamento: 'Texto',
      estado: 'pendiente'
    });
    const { svc } = nuevoServicio({ prescripcion });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('RN-06: paciente que no coincide -> 400', async () => {
    const prescripcion = new Prescripcion({
      id: 1, idVisita: 1, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan',
      estado: 'pendiente'
    });
    const med = new Medicamento({ id: 2, nombre: 'Losartan', stock: 100, precioUnitario: 1 });
    const { svc } = nuevoServicio({ prescripcion, medicamento: med });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, idPaciente: 999, cantidad: 1 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('stock insuficiente -> 409', async () => {
    const prescripcion = new Prescripcion({
      id: 1, idVisita: 1, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan',
      estado: 'pendiente'
    });
    const med = new Medicamento({ id: 2, nombre: 'Losartan', stock: 1, precioUnitario: 1 });
    const { svc } = nuevoServicio({ prescripcion, medicamento: med });
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 10 }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('dispensar OK: aplica RN-09, descuenta stock y marca dispensada', async () => {
    const prescripcion = new Prescripcion({
      id: 1, idVisita: 1, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan',
      estado: 'pendiente'
    });
    const med = new Medicamento({ id: 2, nombre: 'Losartan', stock: 100, precioUnitario: 1.20 });
    const { svc, medRepo, presRepo } = nuevoServicio({ prescripcion, medicamento: med });
    const r = await svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 5 });
    expect(r.costoTotal).toBe(4.80);   // 5 * 1.20 * 0.8
    expect(medRepo.actualizarStock).toHaveBeenCalledWith(2, 95);
    expect(presRepo.marcarDispensada).toHaveBeenCalledWith(1, expect.any(Number));
  });
});
