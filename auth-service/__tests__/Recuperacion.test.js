/**
 * RF-42 / UC-10.4: recuperacion de contrasena.
 * Token aleatorio guardado solo como hash, 30 minutos, un solo uso; la
 * nueva contrasena con la misma regla que el alta; misma respuesta exista
 * o no el correo; auditoria; el correo sale por notificaciones-service.
 */
process.env.JWT_SECRET = 'test-secret-recuperacion';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const RecuperacionService = require('../src/services/RecuperacionService');
const AuthController = require('../src/controllers/AuthController');
const AuthService = require('../src/services/AuthService');
const Usuario = require('../src/models/Usuario');

const ANA = new Usuario({ id: 7, nombre: 'Ana Perez', email: 'ana@asilo.gt', passwordHash: 'x', rol: 'enfermero', activo: true });

// Repositorio de tokens en memoria con la semantica del SQL (hash, vence, un uso).
function tokensEnMemoria() {
  const filas = [];
  return {
    filas,
    guardar: jest.fn(async (idUsuario, tokenHash, expira) => {
      filas.filter(f => f.idUsuario === idUsuario && !f.usado).forEach(f => { f.usado = new Date(); });
      filas.push({ idUsuario, tokenHash, expira, usado: null });
    }),
    obtenerVigente: jest.fn(async h => filas.find(f => f.tokenHash === h && !f.usado && f.expira > new Date()) || null),
    consumir: jest.fn(async (h, passwordHash) => {
      const f = filas.find(x => x.tokenHash === h && !x.usado && x.expira > new Date());
      if (!f) return null;
      f.usado = new Date(); f.passwordHash = passwordHash;
      return f.idUsuario;
    })
  };
}

function nuevo({ usuario = ANA } = {}) {
  const usuarioRepo = {
    obtenerPorEmail: jest.fn(async e => (usuario && e === usuario.email ? usuario : null)),
    obtenerPorId: jest.fn(async () => usuario)
  };
  const tokenRepo = tokensEnMemoria();
  const hasher = { hash: jest.fn(async p => bcrypt.hash(p, 4)) };
  const notif = { enviarRecuperacion: jest.fn(async () => ({ id: 55 })) };
  const svc = new RecuperacionService(usuarioRepo, tokenRepo, hasher, notif, { minutos: 30, urlBase: 'http://asilo.test:8090' });
  return { svc, usuarioRepo, tokenRepo, hasher, notif };
}
const tokenDelEnlace = notif => notif.enviarRecuperacion.mock.calls.at(-1)[0].enlace.split('#restablecer=')[1];

describe('Recuperacion de contrasena (RF-42)', () => {
  test('solicitar: token de 256 bits, en la BD solo su hash, vence en 30 min, enlace por notificaciones', async () => {
    const { svc, tokenRepo, notif } = nuevo();
    const antes = Date.now();
    const r = await svc.solicitar('ANA@asilo.gt ');
    expect(r).toMatchObject({ enviado: true, idNotificacion: 55 });
    const token = tokenDelEnlace(notif);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const fila = tokenRepo.filas[0];
    expect(fila.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(tokenRepo.filas)).not.toContain(token);
    expect(fila.expira.getTime() - antes).toBeGreaterThanOrEqual(30 * 60 * 1000 - 50);
    expect(fila.expira.getTime() - antes).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
    expect(notif.enviarRecuperacion).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@asilo.gt', nombre: 'Ana Perez', minutos: 30,
      enlace: expect.stringMatching(/^http:\/\/asilo\.test:8090\/#restablecer=/) }));
  });

  test('dos solicitudes: el token anterior deja de servir', async () => {
    const { svc, notif } = nuevo();
    await svc.solicitar('ana@asilo.gt'); const t1 = tokenDelEnlace(notif);
    await svc.solicitar('ana@asilo.gt'); const t2 = tokenDelEnlace(notif);
    expect(t1).not.toBe(t2);
    await expect(svc.restablecer({ token: t1, password: 'Nueva1234' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.restablecer({ token: t2, password: 'Nueva1234' })).resolves.toMatchObject({ id: 7 });
  });

  test('correo inexistente o cuenta desactivada: no se genera token ni correo', async () => {
    for (const usuario of [null, new Usuario({ ...ANA, activo: false })]) {
      const { svc, tokenRepo, notif } = nuevo({ usuario });
      expect(await svc.solicitar('ana@asilo.gt')).toMatchObject({ enviado: false });
      expect(tokenRepo.guardar).not.toHaveBeenCalled();
      expect(notif.enviarRecuperacion).not.toHaveBeenCalled();
    }
  });

  test('restablecer: cambia la contrasena (bcrypt) y el token es de un solo uso', async () => {
    const { svc, tokenRepo, notif } = nuevo();
    await svc.solicitar('ana@asilo.gt');
    const token = tokenDelEnlace(notif);
    await svc.restablecer({ token, password: 'Nueva1234' });
    expect(await bcrypt.compare('Nueva1234', tokenRepo.filas[0].passwordHash)).toBe(true);
    await expect(svc.restablecer({ token, password: 'Otra1234' })).rejects.toMatchObject({ status: 400 });
  });

  test('token vencido (mas de 30 min) -> 400', async () => {
    const { svc, tokenRepo, notif } = nuevo();
    await svc.solicitar('ana@asilo.gt');
    tokenRepo.filas[0].expira = new Date(Date.now() - 1000);
    await expect(svc.restablecer({ token: tokenDelEnlace(notif), password: 'Nueva1234' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no es valido o ya vencio/) });
  });

  test('la nueva contrasena cumple la misma regla que el alta; un token falso no gasta bcrypt', async () => {
    const { svc, hasher, notif } = nuevo();
    await svc.solicitar('ana@asilo.gt');
    await expect(svc.restablecer({ token: tokenDelEnlace(notif), password: '123' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/al menos 6/) });
    await expect(new AuthService({ obtenerPorEmail: async () => null }, hasher).registrar(
      { nombre: 'X', email: 'x@asilo.gt', password: '123', rol: 'enfermero' })).rejects.toThrow(/al menos 6/);
    await expect(svc.restablecer({ token: 'A'.repeat(43), password: 'Nueva1234' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.restablecer({ token: "' OR 1=1 --", password: 'Nueva1234' })).rejects.toMatchObject({ status: 400 });
    expect(hasher.hash).not.toHaveBeenCalled();
  });
});

describe('AuthController de recuperacion', () => {
  const res = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

  test('/recuperar responde lo mismo exista o no el correo, y audita solo la cuenta real', async () => {
    const respuestas = [];
    for (const usuario of [ANA, null]) {
      const { svc } = nuevo({ usuario });
      const auditoria = { registrar: jest.fn(async () => ({})) };
      const r = res();
      await new AuthController({}, auditoria, svc).recuperar({ body: { email: 'ana@asilo.gt' }, ip: '10.0.0.4', headers: {} }, r);
      respuestas.push([r.code, r.body]);
      if (usuario) {
        expect(auditoria.registrar).toHaveBeenCalledWith(
          expect.objectContaining({ ip: '10.0.0.4', modulo: 'usuarios', usuario: { sub: 7, email: 'ana@asilo.gt' } }),
          'modificar', 'usuario', 7, expect.stringMatching(/recuperacion de contrasena solicitada/));
      } else {
        expect(auditoria.registrar).not.toHaveBeenCalled();
      }
    }
    expect(respuestas[0]).toEqual(respuestas[1]);
    expect(respuestas[0][0]).toBeUndefined(); // 200 por defecto
  });

  test('/recuperar con correo mal formado -> 400', async () => {
    const r = res();
    await new AuthController({}, null, nuevo().svc).recuperar({ body: { email: 'no-es-correo' }, headers: {} }, r);
    expect(r.code).toBe(400);
  });

  test('/restablecer audita el cambio sin guardar la contrasena', async () => {
    const { svc, notif } = nuevo();
    await svc.solicitar('ana@asilo.gt');
    const auditoria = { registrar: jest.fn(async () => ({})) };
    const r = res();
    await new AuthController({}, auditoria, svc).restablecer(
      { body: { token: tokenDelEnlace(notif), password: 'Nueva1234' }, ip: '10.0.0.4', headers: {} }, r);
    expect(r.body.mensaje).toMatch(/Contrasena actualizada/);
    const llamada = JSON.stringify(auditoria.registrar.mock.calls[0]);
    expect(llamada).toMatch(/contrasena restablecida/);
    expect(llamada).not.toMatch(/Nueva1234/);
  });
});
