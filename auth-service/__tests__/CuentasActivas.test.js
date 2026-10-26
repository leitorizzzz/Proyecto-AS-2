/**
 * Desactivacion de cuentas: login bloqueado (403) y reglas de
 * desactivar / reactivar en AuthService.
 */
process.env.JWT_SECRET = 'test-secret-auth';

const bcrypt = require('bcryptjs');
const AuthService = require('../src/services/AuthService');
const Usuario = require('../src/models/Usuario');

async function nuevo(usuario) {
  const repo = {
    obtenerPorEmail: jest.fn(async () => usuario),
    obtenerPorId: jest.fn(async () => usuario),
    listar: jest.fn(async () => []),
    cambiarActivo: jest.fn(async (id, activo) => new Usuario({ ...usuario, id, activo }))
  };
  return { svc: new AuthService(repo), repo };
}

describe('AuthService — cuentas desactivadas', () => {

  test('login de cuenta desactivada con password correcta -> 403', async () => {
    const passwordHash = await bcrypt.hash('Demo1234', 4);
    const { svc } = await nuevo(new Usuario({ id: 5, email: 'x@asilo.gt', passwordHash, rol: 'farmacia', activo: false }));
    await expect(svc.login({ email: 'x@asilo.gt', password: 'Demo1234' }))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/desactivada/) });
  });

  test('login de cuenta desactivada con password incorrecta -> 401 generico (no revela el estado)', async () => {
    const passwordHash = await bcrypt.hash('Demo1234', 4);
    const { svc } = await nuevo(new Usuario({ id: 5, email: 'x@asilo.gt', passwordHash, rol: 'farmacia', activo: false }));
    const err = await svc.login({ email: 'x@asilo.gt', password: 'mala' }).catch(e => e);
    expect(err.message).toBe('Credenciales inválidas');
    expect(err.status).toBeUndefined();
  });

  test('un admin no puede desactivar su propia cuenta -> 409', async () => {
    const { svc, repo } = await nuevo(new Usuario({ id: 1, email: 'admin@asilo.gt', rol: 'admin', activo: true }));
    await expect(svc.desactivarUsuario(1, 1)).rejects.toMatchObject({ status: 409 });
    expect(repo.cambiarActivo).not.toHaveBeenCalled();
  });

  test('desactivar cuenta activa de otro usuario -> activo false, sin passwordHash', async () => {
    const { svc, repo } = await nuevo(new Usuario({ id: 8, email: 'f@asilo.gt', passwordHash: 'h', rol: 'farmacia', activo: true }));
    const r = await svc.desactivarUsuario(8, 1);
    expect(repo.cambiarActivo).toHaveBeenCalledWith(8, false);
    expect(r).toMatchObject({ id: 8, activo: false });
    expect(r).not.toHaveProperty('passwordHash');
  });

  test('desactivar una cuenta ya desactivada -> 409', async () => {
    const { svc } = await nuevo(new Usuario({ id: 8, email: 'f@asilo.gt', rol: 'farmacia', activo: false }));
    await expect(svc.desactivarUsuario(8, 1)).rejects.toMatchObject({ status: 409 });
  });

  test('reactivar una cuenta activa -> 409; inexistente -> 404', async () => {
    const { svc } = await nuevo(new Usuario({ id: 8, email: 'f@asilo.gt', rol: 'farmacia', activo: true }));
    await expect(svc.reactivarUsuario(8)).rejects.toMatchObject({ status: 409 });
    const { svc: svc2 } = await nuevo(null);
    await expect(svc2.reactivarUsuario(99)).rejects.toMatchObject({ status: 404 });
  });

  test('listarUsuarios pasa incluirInactivos al repositorio', async () => {
    const { svc, repo } = await nuevo(null);
    await svc.listarUsuarios({ incluirInactivos: true });
    expect(repo.listar).toHaveBeenCalledWith({ roles: [], incluirInactivos: true });
  });
});
