/**
 * Auditoria del lado escritor: AuditoriaService (copia identica en auth,
 * pacientes, farmacia y financiero) y su uso desde un controlador.
 */
const AuditoriaService = require('../src/services/AuditoriaService');
const PacienteController = require('../src/controllers/PacienteController');

const usuario = { sub: 7, email: 'enfermeria@asilo.gt', rol: 'enfermero' };

function resMock() {
  const res = { statusCode: 200, body: null };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  return res;
}

describe('AuditoriaService (escritor)', () => {

  test('registrar guarda usuario del JWT, accion, entidad, id y detalle', async () => {
    const repo = { guardar: jest.fn(async r => ({ ...r, id: 1 })) };
    await new AuditoriaService(repo).registrar(usuario, 'desactivar', 'paciente', 12, 'Rosa Gomez');
    expect(repo.guardar).toHaveBeenCalledWith(expect.objectContaining({
      usuario: 'enfermeria@asilo.gt', idUsuario: 7, accion: 'desactivar',
      entidad: 'paciente', idEntidad: 12, detalle: 'Rosa Gomez'
    }));
  });

  test('si la BD falla, no lanza (la operacion auditada no se cae) y devuelve null', async () => {
    const repo = { guardar: jest.fn(async () => { throw new Error('timeout'); }) };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(new AuditoriaService(repo).registrar(usuario, 'crear', 'paciente', 1)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('accion o entidad desconocida -> no escribe', async () => {
    const repo = { guardar: jest.fn() };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new AuditoriaService(repo);
    await svc.registrar(usuario, 'borrar', 'paciente', 1);
    await svc.registrar(usuario, 'crear', 'planeta', 1);
    expect(repo.guardar).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('detalle se recorta a 300 caracteres', async () => {
    const repo = { guardar: jest.fn(async r => r) };
    await new AuditoriaService(repo).registrar(usuario, 'modificar', 'visita', 1, 'x'.repeat(500));
    expect(repo.guardar.mock.calls[0][0].detalle).toHaveLength(300);
  });
});

describe('PacienteController registra auditoria', () => {

  test('desactivar paciente -> auditoria desactivar/paciente con el id', async () => {
    const service = { desactivar: jest.fn(async id => ({ id, nombres: 'Rosa', apellidos: 'Gomez', activo: false })) };
    const auditoria = { registrar: jest.fn(async () => ({})) };
    const res = resMock();
    await new PacienteController(service, auditoria).desactivar({ params: { id: '12' }, usuario }, res);
    expect(res.body).toMatchObject({ id: 12, activo: false });
    expect(auditoria.registrar).toHaveBeenCalledWith(usuario, 'desactivar', 'paciente', 12, 'Rosa Gomez');
  });

  test('si la operacion falla, no se registra auditoria', async () => {
    const service = { desactivar: jest.fn(async () => { throw Object.assign(new Error('ya'), { status: 409 }); }) };
    const auditoria = { registrar: jest.fn() };
    const res = resMock();
    await new PacienteController(service, auditoria).desactivar({ params: { id: '12' }, usuario }, res);
    expect(res.statusCode).toBe(409);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  test('listar con incluirInactivos sin ser admin -> 403', async () => {
    const service = { listar: jest.fn() };
    const res = resMock();
    await new PacienteController(service).listar({ query: { incluirInactivos: 'true' }, usuario }, res);
    expect(res.statusCode).toBe(403);
    expect(service.listar).not.toHaveBeenCalled();
  });
});
