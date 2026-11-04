/**
 * Caso 15 del SQA ("no aparece el precio base de cada examen"): cada orden
 * pendiente de laboratorio trae precio base, descuento de la fundacion,
 * costo con descuento y estado.
 */
process.env.DESCUENTO_FUNDACION = '0.20';
const LaboratorioService = require('../src/services/LaboratorioService');

const orden = extra => ({ idExamen: 1, tipo: 'Electrocardiograma', estadoOrden: 'pendiente', pacienteNombres: 'Ana', ...extra });
const servicio = ordenes => new LaboratorioService({ listarOrdenesPendientes: jest.fn(async () => ordenes) }, {});

describe('Órdenes pendientes con su costo (caso 15)', () => {
  test('usa el precio registrado al ordenar', async () => {
    const [o] = await servicio([orden({ precioBase: 200, descuento: 40, costo: 160, precioCatalogo: 250 })]).ordenesPendientes();
    expect(o).toMatchObject({ precioBase: 200, descuento: 40, costo: 160, estado: 'pendiente', registradoAlOrdenar: true, porcentajeDescuento: 0.2 });
    expect(o).not.toHaveProperty('precioCatalogo');
  });

  test('orden anterior sin precio congelado: calcula con el catálogo y el 20 %', async () => {
    const [o] = await servicio([orden({ precioBase: null, descuento: null, costo: null, precioCatalogo: 85 })]).ordenesPendientes();
    expect(o).toMatchObject({ precioBase: 85, descuento: 17, costo: 68, registradoAlOrdenar: false });
  });

  test('sin precio en ningún lado: valores nulos, no NaN', async () => {
    const [o] = await servicio([orden({ precioBase: null, costo: null, precioCatalogo: null })]).ordenesPendientes();
    expect(o).toMatchObject({ precioBase: null, descuento: null, costo: null });
  });
});
