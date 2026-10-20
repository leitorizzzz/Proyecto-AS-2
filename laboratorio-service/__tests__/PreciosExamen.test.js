/**
 * Pruebas unitarias del catalogo de precios en LaboratorioService:
 * RN-09 en el listado, validaciones y unicidad del tipo de examen.
 */
const LaboratorioService = require('../src/services/LaboratorioService');
const PrecioExamen = require('../src/models/PrecioExamen');

function nuevoServicio({ precios = [] } = {}) {
  const lista = precios.map(p => new PrecioExamen(p));
  const precioRepo = {
    listar: jest.fn(async () => lista),
    obtenerPorId: jest.fn(async id => lista.find(p => p.id === id) || null),
    obtenerPorTipo: jest.fn(async tipo => lista.find(p => p.tipo === tipo) || null),
    guardar: jest.fn(async p => new PrecioExamen({ ...p, id: 99 })),
    actualizar: jest.fn(async (id, p) => new PrecioExamen({ ...p, id }))
  };
  process.env.DESCUENTO_FUNDACION = '0.20';
  return { svc: new LaboratorioService({}, {}, precioRepo), precioRepo };
}

describe('LaboratorioService — precios de examenes', () => {

  test('RN-09: listarPrecios incluye precioConDescuento (85 -> 68)', async () => {
    const { svc } = nuevoServicio({ precios: [{ id: 1, tipo: 'Hematologia completa', precioBase: 85 }] });
    const [p] = await svc.listarPrecios();
    expect(p).toMatchObject({ precioBase: 85, porcentajeDescuento: 0.2, precioConDescuento: 68 });
  });

  test('crearPrecio sin tipo -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.crearPrecio({ tipo: '  ', precioBase: 10 })).rejects.toMatchObject({ status: 400 });
  });

  test('crearPrecio con precio 0 -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.crearPrecio({ tipo: 'EKG', precioBase: 0 })).rejects.toMatchObject({ status: 400 });
  });

  test('crearPrecio con tipo existente -> 409', async () => {
    const { svc } = nuevoServicio({ precios: [{ id: 1, tipo: 'EKG', precioBase: 200 }] });
    await expect(svc.crearPrecio({ tipo: 'EKG', precioBase: 150 })).rejects.toMatchObject({ status: 409 });
  });

  test('crearPrecio OK recorta el tipo y redondea a 2 decimales', async () => {
    const { svc, precioRepo } = nuevoServicio();
    const p = await svc.crearPrecio({ tipo: ' Perfil tiroideo ', precioBase: '110.456' });
    expect(precioRepo.guardar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'Perfil tiroideo', precioBase: 110.46 }));
    expect(p.precioConDescuento).toBe(88.37);
  });

  test('actualizarPrecio de un id inexistente -> 404', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.actualizarPrecio(5, { precioBase: 10 })).rejects.toMatchObject({ status: 404 });
  });

  test('actualizarPrecio renombrando a un tipo de otro precio -> 409', async () => {
    const { svc } = nuevoServicio({ precios: [
      { id: 1, tipo: 'EKG', precioBase: 200 },
      { id: 2, tipo: 'Uroanalisis', precioBase: 60 }
    ] });
    await expect(svc.actualizarPrecio(2, { tipo: 'EKG', precioBase: 60 })).rejects.toMatchObject({ status: 409 });
  });

  test('actualizarPrecio solo con precioBase conserva el tipo', async () => {
    const { svc, precioRepo } = nuevoServicio({ precios: [{ id: 2, tipo: 'Uroanalisis', precioBase: 60 }] });
    const p = await svc.actualizarPrecio(2, { precioBase: 75 });
    expect(precioRepo.actualizar).toHaveBeenCalledWith(2, expect.objectContaining({ tipo: 'Uroanalisis', precioBase: 75 }));
    expect(p.precioConDescuento).toBe(60);
  });
});
