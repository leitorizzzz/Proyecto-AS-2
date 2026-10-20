/**
 * Pruebas unitarias de PacienteService: validaciones de alta/edicion y
 * borrado bloqueado cuando el paciente ya tiene historial (FK).
 */
const PacienteService = require('../src/services/PacienteService');

const VALIDO = {
  nombres: 'Maria', apellidos: 'Lopez', fechaNacimiento: '1940-05-01',
  genero: 'F', dpi: '1234567890123'
};

function nuevoServicio({ porId = { id: 1, ...VALIDO }, porDpi = null, errorAlEliminar = null } = {}) {
  const repo = {
    obtenerPorId: jest.fn(async () => porId),
    obtenerPorDpi: jest.fn(async () => porDpi),
    guardar: jest.fn(async p => ({ ...p, id: 2 })),
    actualizar: jest.fn(async (id, p) => ({ ...p, id })),
    eliminar: jest.fn(async () => {
      if (errorAlEliminar) throw errorAlEliminar;
      return true;
    })
  };
  return { svc: new PacienteService(repo), repo };
}

describe('PacienteService', () => {

  test('registrar con DPI de 12 digitos -> error', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.registrar({ ...VALIDO, dpi: '123456789012' })).rejects.toThrow(/13 digitos/);
  });

  test('registrar con DPI ya existente -> error', async () => {
    const { svc } = nuevoServicio({ porDpi: { id: 5, ...VALIDO } });
    await expect(svc.registrar(VALIDO)).rejects.toThrow(/Ya existe un paciente/);
  });

  test('actualizar con el DPI de otro paciente -> error', async () => {
    const { svc, repo } = nuevoServicio({ porDpi: { id: 5, ...VALIDO } });
    await expect(svc.actualizar(1, VALIDO)).rejects.toThrow(/otro paciente/);
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  test('actualizar conservando su propio DPI -> OK', async () => {
    const { svc, repo } = nuevoServicio({ porDpi: { id: 1, ...VALIDO } });
    await svc.actualizar(1, { ...VALIDO, telefono: '55550000' });
    expect(repo.actualizar).toHaveBeenCalledWith(1, expect.objectContaining({ telefono: '55550000' }));
  });

  test('eliminar paciente con solicitudes (FK 547) -> 409', async () => {
    const fk = Object.assign(new Error('The DELETE statement conflicted with the REFERENCE constraint'), { number: 547 });
    const { svc } = nuevoServicio({ errorAlEliminar: fk });
    await expect(svc.eliminar(1)).rejects.toMatchObject({ status: 409 });
  });

  test('eliminar paciente inexistente -> no encontrado', async () => {
    const { svc } = nuevoServicio({ porId: null });
    await expect(svc.eliminar(99)).rejects.toThrow('Paciente no encontrado');
  });
});
