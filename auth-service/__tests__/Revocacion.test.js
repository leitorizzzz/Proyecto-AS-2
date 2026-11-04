/**
 * Caso 1 del SQA ("al cerrar sesion no se borran las credenciales"):
 * POST /api/auth/logout revoca el jti del token y el middleware de los 7
 * servicios rechaza ese token aunque su firma y su exp sigan validos.
 */
process.env.JWT_SECRET = 'test-secret-revocacion';

const mockRevocados = new Set();
let mockFalla = false;
jest.mock('../src/repositories/TokenRevocadoRepository', () => jest.fn().mockImplementation(() => ({
  estaRevocado: jest.fn(async jti => { if (mockFalla) throw new Error('Invalid object name tokens_revocados'); return mockRevocados.has(jti); }),
  revocar: jest.fn(async jti => { mockRevocados.add(jti); })
})));

const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const autenticar = require('../src/middleware/authMiddleware');
const AuthService = require('../src/services/AuthService');
const TokenRevocadoRepository = require('../src/repositories/TokenRevocadoRepository');

function app() {
  const a = express();
  a.get('/protegido', autenticar, (req, res) => res.json({ ok: true }));
  return a;
}
const firmar = (extra = {}) => jwt.sign({ sub: 1, email: 'x@asilo.gt', rol: 'admin', ...extra }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Revocación de tokens al cerrar sesión', () => {
  beforeEach(() => { mockRevocados.clear(); mockFalla = false; jest.spyOn(console, 'warn').mockImplementation(() => {}); });

  test('token vigente -> pasa; revocado -> 401 con mensaje claro', async () => {
    const t = firmar({ jti: 'jti-1' });
    expect((await request(app()).get('/protegido').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    mockRevocados.add('jti-1');
    const r = await request(app()).get('/protegido').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/revocado/i);
  });

  test('token sin jti (de servicio o anterior al cambio) no se consulta y pasa', async () => {
    expect((await request(app()).get('/protegido').set('Authorization', `Bearer ${firmar()}`)).status).toBe(200);
  });

  test('si la tabla aún no existe, no se bloquea la operación', async () => {
    mockFalla = true;
    expect((await request(app()).get('/protegido').set('Authorization', `Bearer ${firmar({ jti: 'jti-2' })}`)).status).toBe(200);
  });

  test('cerrarSesion guarda el jti con su vencimiento; el login emite jti distinto cada vez', async () => {
    const repo = new TokenRevocadoRepository();
    const svc = new AuthService({}, { compare: async () => true, hash: async () => 'h' }, repo);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(await svc.cerrarSesion({ jti: 'jti-3', exp })).toEqual({ revocado: true });
    expect(repo.revocar).toHaveBeenCalledWith('jti-3', new Date(exp * 1000));
    expect(await svc.cerrarSesion({ exp })).toEqual({ revocado: false });

    const usuario = { id: 5, email: 'a@asilo.gt', rol: 'farmacia', activo: true, passwordHash: 'h', toPublic() { return { id: 5 }; } };
    const svc2 = new AuthService({ obtenerPorEmail: async () => usuario }, { compare: async () => true }, repo);
    const a = jwt.decode((await svc2.login({ email: 'a@asilo.gt', password: 'Demo1234' })).token);
    const b = jwt.decode((await svc2.login({ email: 'a@asilo.gt', password: 'Demo1234' })).token);
    expect(a.jti).toBeTruthy();
    expect(a.jti).not.toBe(b.jti);
  });

  const raiz = path.join(__dirname, '..', '..');
  const leer = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  test.each(['farmacia', 'pacientes', 'laboratorio', 'financiero', 'reportes', 'notificaciones'])
  ('%s-service: middleware y repositorio de revocación idénticos', s => {
    expect(leer(path.join(raiz, `${s}-service/src/middleware/authMiddleware.js`))).toBe(leer(path.join(raiz, 'auth-service/src/middleware/authMiddleware.js')));
    expect(leer(path.join(raiz, `${s}-service/src/repositories/TokenRevocadoRepository.js`))).toBe(leer(path.join(raiz, 'auth-service/src/repositories/TokenRevocadoRepository.js')));
  });
});
