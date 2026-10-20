/**
 * Pruebas RBAC de auth-service: registro solo admin y directorio de
 * usuarios solo admin / coordinador_fundacion. Controller stub, sin BD.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasAuth = require('../src/routes/authRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const ctrlStub = {
    register: (_r, res) => res.status(201).json({ id: 1 }),
    login: (_r, res) => res.json({ token: 't' }),
    me: (_r, res) => res.json({ id: 1 }),
    listarUsuarios: (_r, res) => res.json([])
  };
  const a = express();
  a.use(express.json());
  a.use('/api/auth', crearRutasAuth(ctrlStub));
  return a;
}

describe('RBAC auth-service', () => {
  const srv = app();
  const get = rol => request(srv).get('/api/auth/usuarios').set('Authorization', `Bearer ${tokenConRol(rol)}`);

  test('register con rol farmacia -> 403 (solo admin)', async () => {
    const r = await request(srv).post('/api/auth/register')
      .set('Authorization', `Bearer ${tokenConRol('farmacia')}`).send({});
    expect(r.status).toBe(403);
  });

  test('GET /usuarios sin token -> 401', async () => {
    expect((await request(srv).get('/api/auth/usuarios')).status).toBe(401);
  });

  test('GET /usuarios con rol farmacia -> 403', async () => {
    expect((await get('farmacia')).status).toBe(403);
  });

  test('GET /usuarios con rol coordinador_fundacion -> 200', async () => {
    expect((await get('coordinador_fundacion')).status).toBe(200);
  });
});
