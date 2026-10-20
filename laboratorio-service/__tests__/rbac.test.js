/**
 * Pruebas RBAC de laboratorio-service: ordenes y resultados solo
 * laboratorio/admin; catalogo de precios legible por cualquier
 * autenticado y modificable solo por admin.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasLaboratorio = require('../src/routes/laboratorioRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const ok = (_r, res) => res.json({});
  const ctrlStub = {
    ordenesPendientes: (_r, res) => res.json([]),
    identificarPaciente: ok,
    registrarResultado: (_r, res) => res.status(201).json({}),
    obtenerResultadoPorExamen: ok,
    costoConDescuento: ok,
    listarPrecios: (_r, res) => res.json([]),
    crearPrecio: (_r, res) => res.status(201).json({}),
    actualizarPrecio: ok
  };
  const a = express();
  a.use(express.json());
  a.use('/api/laboratorio', crearRutasLaboratorio(ctrlStub));
  return a;
}

describe('RBAC laboratorio-service', () => {
  const srv = app();
  const con = rol => ({ Authorization: `Bearer ${tokenConRol(rol)}` });

  test('ordenes pendientes con rol medico_especialista -> 403', async () => {
    expect((await request(srv).get('/api/laboratorio/ordenes-pendientes').set(con('medico_especialista'))).status).toBe(403);
  });

  test('listar precios con rol enfermero -> 200', async () => {
    expect((await request(srv).get('/api/laboratorio/precios').set(con('enfermero'))).status).toBe(200);
  });

  test('crear precio con rol laboratorio -> 403 (solo admin)', async () => {
    expect((await request(srv).post('/api/laboratorio/precios').set(con('laboratorio')).send({})).status).toBe(403);
  });

  test('crear precio con rol admin -> 201', async () => {
    expect((await request(srv).post('/api/laboratorio/precios').set(con('admin')).send({})).status).toBe(201);
  });

  test('editar precio con rol farmacia -> 403', async () => {
    expect((await request(srv).put('/api/laboratorio/precios/1').set(con('farmacia')).send({})).status).toBe(403);
  });
});
