/**
 * Pruebas RBAC de /api/pacientes: alta y edicion solo enfermero/admin,
 * borrado solo admin, lectura para cualquier autenticado.
 * Controller stub: solo se valida el pipe de middlewares.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasPacientes = require('../src/routes/pacientesRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const ctrlStub = {
    listar: (_r, res) => res.json([]),
    obtener: (_r, res) => res.json({}),
    crear: (_r, res) => res.status(201).json({ id: 1 }),
    actualizar: (_r, res) => res.json({ id: 1 }),
    eliminar: (_r, res) => res.status(204).send()
  };
  const a = express();
  a.use(express.json());
  a.use('/api/pacientes', crearRutasPacientes(ctrlStub));
  return a;
}

describe('RBAC /api/pacientes', () => {
  const srv = app();
  const con = rol => ({ Authorization: `Bearer ${tokenConRol(rol)}` });

  test('crear paciente con rol farmacia -> 403', async () => {
    expect((await request(srv).post('/api/pacientes').set(con('farmacia')).send({})).status).toBe(403);
  });

  test('crear paciente con rol enfermero -> 201', async () => {
    expect((await request(srv).post('/api/pacientes').set(con('enfermero')).send({})).status).toBe(201);
  });

  test('editar paciente con rol medico_general -> 403', async () => {
    expect((await request(srv).put('/api/pacientes/1').set(con('medico_general')).send({})).status).toBe(403);
  });

  test('editar paciente con rol enfermero -> 200', async () => {
    expect((await request(srv).put('/api/pacientes/1').set(con('enfermero')).send({})).status).toBe(200);
  });

  test('borrar paciente con rol enfermero -> 403 (solo admin)', async () => {
    expect((await request(srv).delete('/api/pacientes/1').set(con('enfermero'))).status).toBe(403);
  });

  test('borrar paciente con rol admin -> 204', async () => {
    expect((await request(srv).delete('/api/pacientes/1').set(con('admin'))).status).toBe(204);
  });

  test('listar pacientes con rol laboratorio -> 200', async () => {
    expect((await request(srv).get('/api/pacientes').set(con('laboratorio'))).status).toBe(200);
  });
});
