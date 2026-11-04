/**
 * Caso 18 del SQA: el historial de despachos de un paciente trae el nombre
 * del medicamento, precio base, descuento de la fundacion y costo, y el
 * avance de la prescripcion (entregado de prescrito).
 */
const FarmaciaService = require('../src/services/FarmaciaService');

function servicio(despachos) {
  const dispRepo = { obtenerPorPaciente: jest.fn(async () => despachos) };
  return new FarmaciaService({}, dispRepo, {});
}

describe('Historial de despachos (caso 18)', () => {
  test('usa el monto base guardado y calcula el descuento', async () => {
    const r = await servicio([{ id: 1, cantidad: 4, costoTotal: 8, montoBase: 10, medicamento: 'Amlodipino',
      cantidadPrescrita: 10, cantidadEntregada: 4, estadoPrescripcion: 'parcial', precioUnitario: 2.5 }]).historialPorPaciente(3);
    expect(r.dispensaciones[0]).toMatchObject({ medicamento: 'Amlodipino', montoBase: 10, descuento: 2, costoTotal: 8,
      cantidadPrescrita: 10, cantidadEntregada: 4, estadoPrescripcion: 'parcial' });
    expect(r.totalGastado).toBe(8);
  });

  test('despacho antiguo sin monto base: se reconstruye con el precio unitario', async () => {
    const r = await servicio([{ id: 2, cantidad: 3, costoTotal: 2.88, montoBase: null, precioUnitario: 1.2 }]).historialPorPaciente(3);
    expect(r.dispensaciones[0]).toMatchObject({ montoBase: 3.6, descuento: 0.72 });
  });
});
