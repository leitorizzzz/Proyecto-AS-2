/**
 * Regla de contrasena del Analisis (RF-42): minimo 8 caracteres, al menos
 * una letra y un numero. Una sola funcion para alta, cambio y
 * restablecimiento.
 */
process.env.JWT_SECRET = 'test-secret-password';
const bcrypt = require('bcryptjs');
const { validarPassword, faltantesPassword } = require('../src/services/reglasPassword');
const AuthService = require('../src/services/AuthService');
const RecuperacionService = require('../src/services/RecuperacionService');
const AuthController = require('../src/controllers/AuthController');
const Usuario = require('../src/models/Usuario');

const hasher = { hash: jest.fn(async p => bcrypt.hash(p, 4)), compare: (p, h) => bcrypt.compare(p, h) };

describe('Regla de contrasena', () => {
  test.each(['Admin12345', 'Demo1234', 'E2eDemo1234', 'Nueva12345', 'abcdefg1', 'contraseña9'])('%s cumple', p => {
    expect(validarPassword(p)).toBe(p);
  });

  test.each([
    ['', /es obligatoria/],
    ['Abc123', /al menos 8 caracteres/],
    ['abcdefgh', /al menos un número/],
    ['12345678', /al menos una letra/],
    ['abc', /al menos 8 caracteres y al menos un número/]
  ])('"%s" se rechaza con un mensaje claro', (p, msg) => {
    expect(() => validarPassword(p)).toThrow(expect.objectContaining({ status: 400, message: expect.stringMatching(msg) }));
  });

  test('el mensaje lista todo lo que falta, en espanol', () => {
    expect(faltantesPassword('!!!')).toEqual(['al menos 8 caracteres', 'al menos una letra', 'al menos un número']);
    expect(() => validarPassword('!!!')).toThrow('La contraseña debe tener al menos 8 caracteres, al menos una letra y al menos un número.');
  });

  test('mas de 72 bytes (limite de bcrypt) -> rechazo', () => {
    expect(() => validarPassword('a1'.repeat(40))).toThrow(/como máximo 72 bytes/);
  });

  test('no se acepta un valor que no sea texto', () => {
    expect(() => validarPassword(12345678)).toThrow(/obligatoria/);
  });
});

describe('La misma regla en alta, cambio y restablecimiento', () => {
  test('alta: "Demo123" -> 400 sin guardar', async () => {
    const repo = { obtenerPorEmail: jest.fn(async () => null), guardar: jest.fn() };
    await expect(new AuthService(repo, hasher).registrar({ nombre: 'X', email: 'x@asilo.gt', password: 'Demo123', rol: 'enfermero' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/al menos 8 caracteres/) });
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  test('restablecer: "abcdefgh" -> 400 antes de tocar el token', async () => {
    const tokenRepo = { obtenerVigente: jest.fn() };
    const svc = new RecuperacionService({}, tokenRepo, hasher, {}, {});
    await expect(svc.restablecer({ token: 'A'.repeat(43), password: 'abcdefgh' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/al menos un número/) });
    expect(tokenRepo.obtenerVigente).not.toHaveBeenCalled();
  });

  describe('cambio de contrasena (POST /api/auth/cambiar-password)', () => {
    let usuario, repo, svc;
    beforeEach(async () => {
      usuario = new Usuario({ id: 3, nombre: 'Ana', email: 'ana@asilo.gt', rol: 'enfermero', activo: true,
                              passwordHash: await bcrypt.hash('Demo1234', 4) });
      repo = { obtenerPorId: jest.fn(async () => usuario), actualizarPassword: jest.fn(async () => {}) };
      svc = new AuthService(repo, hasher);
    });

    test('con la actual correcta y una nueva valida: guarda el nuevo hash', async () => {
      await svc.cambiarPassword(3, { passwordActual: 'Demo1234', passwordNueva: 'Nueva2026' });
      const [id, hash] = repo.actualizarPassword.mock.calls[0];
      expect(id).toBe(3);
      expect(await bcrypt.compare('Nueva2026', hash)).toBe(true);
    });

    test('actual incorrecta -> 400; nueva debil -> 400; nueva igual a la actual -> 400', async () => {
      await expect(svc.cambiarPassword(3, { passwordActual: 'Otra9999', passwordNueva: 'Nueva2026' }))
        .rejects.toMatchObject({ status: 400, message: 'La contraseña actual no es correcta.' });
      await expect(svc.cambiarPassword(3, { passwordActual: 'Demo1234', passwordNueva: 'corta1' }))
        .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/al menos 8 caracteres/) });
      await expect(svc.cambiarPassword(3, { passwordActual: 'Demo1234', passwordNueva: 'Demo1234' }))
        .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/distinta de la actual/) });
      expect(repo.actualizarPassword).not.toHaveBeenCalled();
    });

    test('el controlador responde y audita sin guardar la contrasena', async () => {
      const auditoria = { registrar: jest.fn(async () => ({})) };
      const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
      await new AuthController(svc, auditoria).cambiarPassword(
        { usuario: { sub: 3, email: 'ana@asilo.gt' }, body: { passwordActual: 'Demo1234', passwordNueva: 'Nueva2026' }, ip: '10.0.0.2', headers: {} }, res);
      expect(res.body).toEqual({ mensaje: 'Contraseña actualizada.' });
      const llamada = JSON.stringify(auditoria.registrar.mock.calls[0]);
      expect(llamada).toMatch(/contrasena cambiada/);
      expect(llamada).not.toMatch(/Nueva2026|Demo1234/);
    });
  });
});
