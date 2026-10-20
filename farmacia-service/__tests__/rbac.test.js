/**
 * Pruebas RBAC de farmacia-service: inventario y dispensacion solo
 * farmacia/admin; lectura del inventario para cualquier autenticado.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasFarmacia = require('../src/routes/farmaciaRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const ok = (_r, res) => res.json({});
  const ctrlStub = {
    listarMedicamentos: (_r, res) => res.json([]),
    obtenerMedicamento: ok,
    crearMedicamento: (_r, res) => res.status(201).json({ id: 1 }),
    actualizarMedicamento: ok,
    eliminarMedicamento: (_r, res) => res.status(204).send(),
    prescripcionesPendientesPaciente: (_r, res) => res.json([]),
    dispensar: (_r, res) => res.status(201).json({ id: 1 }),
    historialPaciente: ok
  };
  const a = express();
  a.use(express.json());
  a.use('/api/farmacia', crearRutasFarmacia(ctrlStub));
  return a;
}

describe('RBAC farmacia-service', () => {
  const srv = app();
  const con = rol => ({ Authorization: `Bearer ${tokenConRol(rol)}` });

  test('crear medicamento con rol laboratorio -> 403', async () => {
    expect((await request(srv).post('/api/farmacia/medicamentos').set(con('laboratorio')).send({})).status).toBe(403);
  });

  test('dispensar con rol enfermero -> 403', async () => {
    expect((await request(srv).post('/api/farmacia/dispensaciones').set(con('enfermero')).send({})).status).toBe(403);
  });

  test('dispensar con rol farmacia -> 201', async () => {
    expect((await request(srv).post('/api/farmacia/dispensaciones').set(con('farmacia')).send({})).status).toBe(201);
  });

  test('listar inventario con rol medico_especialista -> 200', async () => {
    expect((await request(srv).get('/api/farmacia/medicamentos').set(con('medico_especialista'))).status).toBe(200);
  });
});
