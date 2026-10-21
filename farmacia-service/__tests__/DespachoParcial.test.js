/**
 * Caso 18 del plan del SQA: despacho parcial. La prescripcion lleva una
 * cantidad prescrita; cada entrega acumula lo entregado y el estado pasa
 * pendiente -> parcial -> dispensada. RN-06 y RN-09 siguen vigentes.
 */
const FarmaciaService = require('../src/services/FarmaciaService');
const Medicamento = require('../src/models/Medicamento');
const Prescripcion = require('../src/models/Prescripcion');

function nuevo(prescripcion) {
  const medRepo = { obtenerPorId: jest.fn(async () => new Medicamento({ id: 2, nombre: 'Losartan', stock: 100, precioUnitario: 1.5 })) };
  const presRepo = { obtenerPorId: jest.fn(async () => prescripcion) };
  const dispRepo = {
    registrarDespacho: jest.fn(async d => {
      const entregada = prescripcion.cantidadEntregada + d.cantidad;
      return {
        dispensacion: { id: 7, ...d },
        estadoPrescripcion: entregada >= prescripcion.cantidadPrescrita ? 'dispensada' : 'parcial',
        cantidadPrescrita: prescripcion.cantidadPrescrita,
        cantidadEntregada: entregada,
        cargoComplementario: null
      };
    })
  };
  return { svc: new FarmaciaService(medRepo, dispRepo, presRepo), dispRepo };
}
const rx = extra => new Prescripcion({
  id: 1, idVisita: 3, idPaciente: 10, idMedicamento: 2, medicamento: 'Losartan',
  estado: 'pendiente', cantidadPrescrita: 10, cantidadEntregada: 0, ...extra
});

describe('Despacho parcial (caso 18)', () => {

  test('entregar 4 de 10 -> parcial, faltan 6; costo con RN-09', async () => {
    const { svc, dispRepo } = nuevo(rx());
    const r = await svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 4 });
    expect(r).toMatchObject({ estadoPrescripcion: 'parcial', cantidadEntregada: 4, cantidadRestante: 6, costoTotal: 4.8 });
    expect(dispRepo.registrarDespacho).toHaveBeenCalledWith(expect.objectContaining({ idVisita: 3, montoBase: 6, costoTotal: 4.8 }));
  });

  test('una prescripcion parcial admite otra entrega hasta completar -> dispensada', async () => {
    const { svc } = nuevo(rx({ estado: 'parcial', cantidadEntregada: 4 }));
    const r = await svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 6 });
    expect(r).toMatchObject({ estadoPrescripcion: 'dispensada', cantidadRestante: 0 });
  });

  test('entregar mas de lo que falta -> 409 sin tocar la BD', async () => {
    const { svc, dispRepo } = nuevo(rx({ estado: 'parcial', cantidadEntregada: 8 }));
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 3 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/faltan 2 de 10/) });
    expect(dispRepo.registrarDespacho).not.toHaveBeenCalled();
  });

  test('RN-06: una prescripcion ya dispensada no admite mas entregas -> 409', async () => {
    const { svc, dispRepo } = nuevo(rx({ estado: 'dispensada', cantidadEntregada: 10 }));
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1 })).rejects.toMatchObject({ status: 409 });
    expect(dispRepo.registrarDespacho).not.toHaveBeenCalled();
  });

  test('cantidad no entera -> 400', async () => {
    const { svc } = nuevo(rx());
    await expect(svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 1.5 })).rejects.toMatchObject({ status: 400 });
  });

  test('prescripcion anterior sin cantidad prescrita: se admite la entrega (se despacha completa)', async () => {
    const { svc, dispRepo } = nuevo(rx({ cantidadPrescrita: null }));
    await svc.dispensarMedicamento({ idPrescripcion: 1, cantidad: 30 });
    expect(dispRepo.registrarDespacho).toHaveBeenCalled();
  });
});
