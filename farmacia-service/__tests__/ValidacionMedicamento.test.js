/**
 * Validacion del alta y la edicion de medicamentos (auditoria SQA, 26 oct).
 * Antes se aceptaban stock negativo, precio 0, stock decimal (se truncaba),
 * duplicados exactos y un PUT parcial dejaba campos en NULL.
 */
const FarmaciaService = require('../src/services/FarmaciaService');
const Medicamento = require('../src/models/Medicamento');

function nuevoServicio({ existente = null, duplicado = null } = {}) {
  const medRepo = {
    obtenerPorId: jest.fn(async () => existente),
    buscarActivoPorNombre: jest.fn(async () => duplicado),
    guardar: jest.fn(async m => ({ ...m, id: 10 })),
    actualizar: jest.fn(async (id, d) => ({ ...d, id }))
  };
  return { svc: new FarmaciaService(medRepo, {}, {}), medRepo };
}
const VALIDO = { nombre: 'Ácido fólico', presentacion: 'tableta 5 mg', stock: 10, precioUnitario: 0.75 };

describe('Validación de medicamentos', () => {
  test.each([
    ['stock negativo', { stock: -5 }],
    ['stock decimal', { stock: 2.5 }],
    ['stock texto', { stock: 'mucho' }],
    ['precio 0', { precioUnitario: 0 }],
    ['precio negativo', { precioUnitario: -1 }],
    ['precio con 3 decimales', { precioUnitario: 1.555 }],
    ['precio texto', { precioUnitario: 'caro' }],
    ['precio enorme', { precioUnitario: 1e12 }],
    ['nombre en blanco', { nombre: '   ' }],
    ['nombre de 201 caracteres', { nombre: 'x'.repeat(201) }]
  ])('%s -> 400', async (_n, cambio) => {
    const { svc, medRepo } = nuevoServicio();
    await expect(svc.registrarMedicamento({ ...VALIDO, ...cambio })).rejects.toMatchObject({ status: 400 });
    expect(medRepo.guardar).not.toHaveBeenCalled();
  });

  test('alta válida: normaliza espacios y conserva tildes', async () => {
    const { svc, medRepo } = nuevoServicio();
    await svc.registrarMedicamento({ ...VALIDO, nombre: '  Ácido fólico  ' });
    expect(medRepo.guardar.mock.calls[0][0]).toMatchObject({ nombre: 'Ácido fólico', stock: 10, precioUnitario: 0.75 });
  });

  test('mismo nombre y presentación que uno activo -> 409', async () => {
    const { svc, medRepo } = nuevoServicio({ duplicado: new Medicamento({ id: 3, ...VALIDO }) });
    await expect(svc.registrarMedicamento(VALIDO)).rejects.toMatchObject({ status: 409 });
    expect(medRepo.guardar).not.toHaveBeenCalled();
  });

  test('editar a stock negativo -> 400 sin tocar la BD', async () => {
    const { svc, medRepo } = nuevoServicio({ existente: new Medicamento({ id: 3, ...VALIDO }) });
    await expect(svc.actualizarMedicamento(3, { ...VALIDO, stock: -1 })).rejects.toMatchObject({ status: 400 });
    expect(medRepo.actualizar).not.toHaveBeenCalled();
  });

  test('PUT parcial conserva los campos omitidos', async () => {
    const { svc, medRepo } = nuevoServicio({ existente: new Medicamento({ id: 3, ...VALIDO }) });
    await svc.actualizarMedicamento(3, { stock: 40 });
    expect(medRepo.actualizar).toHaveBeenCalledWith(3, { nombre: 'Ácido fólico', presentacion: 'tableta 5 mg', stock: 40, precioUnitario: 0.75 });
  });

  test('editar sin cambiar el nombre no choca consigo mismo', async () => {
    const yo = new Medicamento({ id: 3, ...VALIDO });
    const { svc, medRepo } = nuevoServicio({ existente: yo, duplicado: yo });
    await svc.actualizarMedicamento(3, { precioUnitario: 0.8 });
    expect(medRepo.actualizar).toHaveBeenCalled();
  });
});
