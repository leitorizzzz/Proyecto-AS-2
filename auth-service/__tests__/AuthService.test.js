/**
 * Pruebas unitarias de AuthService.
 * Cubren: validaciones de registro, login (credenciales y JWT emitido) y
 * el directorio de usuarios (sin passwordHash, filtro por rol).
 */
process.env.JWT_SECRET = 'test-secret-auth';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AuthService = require('../src/services/AuthService');
const Usuario = require('../src/models/Usuario');

function nuevoServicio({ existente = null, usuarios = [] } = {}) {
  const repo = {
    obtenerPorEmail: jest.fn(async () => existente),
    obtenerPorId: jest.fn(async () => existente),
    guardar: jest.fn(async u => new Usuario({ ...u, id: 7 })),
    listar: jest.fn(async () => usuarios)
  };
  return { svc: new AuthService(repo), repo };
}

describe('AuthService', () => {

  test('registrar con rol invalido -> error con la lista de roles', async () => {
    const { svc, repo } = nuevoServicio();
    await expect(svc.registrar({ nombre: 'X', email: 'x@asilo.gt', password: 'Demo1234', rol: 'jefe' }))
      .rejects.toThrow(/Rol invalido/);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  test('registrar con email ya usado -> error', async () => {
    const { svc } = nuevoServicio({ existente: new Usuario({ id: 1, email: 'x@asilo.gt' }) });
    await expect(svc.registrar({ nombre: 'X', email: 'x@asilo.gt', password: 'Demo1234', rol: 'farmacia' }))
      .rejects.toThrow(/Ya existe/);
  });

  test('registrar OK guarda hash bcrypt y no devuelve passwordHash', async () => {
    const { svc, repo } = nuevoServicio();
    const u = await svc.registrar({ nombre: 'X', email: 'x@asilo.gt', password: 'Demo1234', rol: 'farmacia' });
    const guardado = repo.guardar.mock.calls[0][0];
    expect(await bcrypt.compare('Demo1234', guardado.passwordHash)).toBe(true);
    expect(u).not.toHaveProperty('passwordHash');
    expect(u.rol).toBe('farmacia');
  });

  test('login con password incorrecta -> Credenciales invalidas', async () => {
    const passwordHash = await bcrypt.hash('Demo1234', 4);
    const { svc } = nuevoServicio({ existente: new Usuario({ id: 1, email: 'x@asilo.gt', passwordHash, rol: 'farmacia' }) });
    await expect(svc.login({ email: 'x@asilo.gt', password: 'otra' })).rejects.toThrow('Credenciales invalidas');
  });

  test('login OK emite JWT con sub, email y rol', async () => {
    const passwordHash = await bcrypt.hash('Demo1234', 4);
    const { svc } = nuevoServicio({ existente: new Usuario({ id: 9, email: 'x@asilo.gt', passwordHash, rol: 'laboratorio' }) });
    const { token } = await svc.login({ email: 'x@asilo.gt', password: 'Demo1234' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ sub: 9, email: 'x@asilo.gt', rol: 'laboratorio' });
  });

  test('listarUsuarios con rol invalido -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.listarUsuarios({ rol: 'medico_especialista,jefe' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('listarUsuarios filtra por roles y no expone passwordHash', async () => {
    const { svc, repo } = nuevoServicio({
      usuarios: [new Usuario({ id: 3, nombre: 'Dr. R', email: 'r@asilo.gt', passwordHash: 'h', rol: 'medico_especialista' })]
    });
    const lista = await svc.listarUsuarios({ rol: 'medico_especialista, especialista' });
    expect(repo.listar).toHaveBeenCalledWith({ roles: ['medico_especialista', 'especialista'] });
    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty('passwordHash');
  });
});
