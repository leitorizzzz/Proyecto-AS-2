/**
 * Auditoria del lado escritor: AuditoriaService (copia identica en auth,
 * pacientes, farmacia y financiero) y su uso desde un controlador.
 * Caso 24 del plan del SQA: usuario, IP, modulo y datos anteriores/nuevos
 * en JSON.
 */
const AuditoriaService = require('../src/services/AuditoriaService');
const RegistroAuditoria = require('../src/models/RegistroAuditoria');
const PacienteController = require('../src/controllers/PacienteController');

const usuario = { sub: 7, email: 'enfermeria@asilo.gt', rol: 'enfermero' };
const ctx = { usuario, ip: '10.0.0.5', modulo: 'pacientes' };

function resMock() {
  const res = { statusCode: 200, body: null };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  return res;
}

describe('AuditoriaService (escritor)', () => {

  test('registrar guarda usuario del JWT, IP, modulo, accion, entidad, id, detalle y antes/despues', async () => {
    const repo = { guardar: jest.fn(async r => ({ ...r, id: 1 })) };
    await new AuditoriaService(repo).registrar(ctx, 'desactivar', 'paciente', 12, 'Rosa Gomez',
      { antes: { activo: true }, despues: { activo: false } });
    const r = repo.guardar.mock.calls[0][0];
    expect(r).toMatchObject({
      usuario: 'enfermeria@asilo.gt', idUsuario: 7, accion: 'desactivar', entidad: 'paciente',
      idEntidad: 12, detalle: 'Rosa Gomez', ip: '10.0.0.5', modulo: 'pacientes'
    });
    expect(JSON.parse(r.datosAnterioresJson())).toEqual({ activo: true });
    expect(JSON.parse(r.datosNuevosJson())).toEqual({ activo: false });
  });

  test('contextoDe toma la IP de X-Forwarded-For (primera) y quita el prefijo ::ffff:', () => {
    expect(AuditoriaService.contextoDe({ usuario, headers: { 'x-forwarded-for': '200.1.2.3, 10.0.0.1' } }, 'farmacia'))
      .toEqual({ usuario, ip: '200.1.2.3', modulo: 'farmacia' });
    expect(AuditoriaService.contextoDe({ usuario, headers: {}, socket: { remoteAddress: '::ffff:172.18.0.1' } }, 'visitas').ip)
      .toBe('172.18.0.1');
  });

  test('el JSON nunca guarda contrasenas, hashes ni tokens', () => {
    const json = RegistroAuditoria.aJson({ email: 'x@asilo.gt', passwordHash: 'h', password: 'p', token: 't', rol: 'admin' });
    expect(JSON.parse(json)).toEqual({ email: 'x@asilo.gt', rol: 'admin' });
  });

  test('crear sin datos anteriores: datosAnteriores null', async () => {
    const repo = { guardar: jest.fn(async r => r) };
    await new AuditoriaService(repo).registrar(ctx, 'crear', 'paciente', 3, null, { despues: { id: 3 } });
    expect(repo.guardar.mock.calls[0][0].datosAnterioresJson()).toBeNull();
  });

  test('si la BD falla, no lanza (la operacion auditada no se cae) y devuelve null', async () => {
    const repo = { guardar: jest.fn(async () => { throw new Error('timeout'); }) };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(new AuditoriaService(repo).registrar(ctx, 'crear', 'paciente', 1)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('accion o entidad desconocida -> no escribe', async () => {
    const repo = { guardar: jest.fn() };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new AuditoriaService(repo);
    await svc.registrar(ctx, 'borrar', 'paciente', 1);
    await svc.registrar(ctx, 'crear', 'planeta', 1);
    expect(repo.guardar).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('detalle se recorta a 300 caracteres', async () => {
    const repo = { guardar: jest.fn(async r => r) };
    await new AuditoriaService(repo).registrar(ctx, 'modificar', 'visita', 1, 'x'.repeat(500));
    expect(repo.guardar.mock.calls[0][0].detalle).toHaveLength(300);
  });
});

describe('PacienteController registra auditoria', () => {

  test('desactivar paciente -> auditoria con IP, modulo y estado anterior / nuevo', async () => {
    const service = {
      obtener: jest.fn(async id => ({ id, nombres: 'Rosa', apellidos: 'Gomez', activo: true })),
      desactivar: jest.fn(async id => ({ id, nombres: 'Rosa', apellidos: 'Gomez', activo: false }))
    };
    const auditoria = { registrar: jest.fn(async () => ({})) };
    const res = resMock();
    const req = { params: { id: '12' }, usuario, headers: { 'x-forwarded-for': '190.5.5.5' } };
    await new PacienteController(service, auditoria).desactivar(req, res);
    expect(res.body).toMatchObject({ id: 12, activo: false });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      { usuario, ip: '190.5.5.5', modulo: 'pacientes' },
      'desactivar', 'paciente', 12, 'Rosa Gomez',
      { antes: expect.objectContaining({ activo: true }), despues: expect.objectContaining({ activo: false }) });
  });

  test('si la operacion falla, no se registra auditoria', async () => {
    const service = {
      obtener: jest.fn(async id => ({ id, activo: false })),
      desactivar: jest.fn(async () => { throw Object.assign(new Error('ya'), { status: 409 }); })
    };
    const auditoria = { registrar: jest.fn() };
    const res = resMock();
    await new PacienteController(service, auditoria).desactivar({ params: { id: '12' }, usuario, headers: {} }, res);
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
