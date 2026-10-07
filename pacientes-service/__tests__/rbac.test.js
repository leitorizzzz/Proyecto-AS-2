/**
 * Pruebas RBAC de pacientes-service: validan que authMiddleware y
 * autorizarRoles rechazan correctamente antes de llegar al service.
 *
 * Montamos un Express minimo con las mismas rutas y un
 * SolicitudController stub (el service no se toca aqui para no depender
 * de la BD; solo validamos el pipe de middlewares).
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasSolicitudes = require('../src/routes/solicitudRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const ctrlStub = {
    listar: (_r, res) => res.json([]),
    obtener: (_r, res) => res.json({}),
    listarPorPaciente: (_r, res) => res.json([]),
    crear: (_r, res) => res.status(201).json({ id: 1 }),
    asignarCita: (_r, res) => res.json({}),
    cancelar: (_r, res) => res.json({})
  };
  const visitaStub = { convertirDesdeSolicitud: (_r, res) => res.status(201).json({ id: 1 }) };
  const a = express();
  a.use(express.json());
  a.use('/api/solicitudes', crearRutasSolicitudes(ctrlStub, visitaStub));
  return a;
}

describe('RBAC pacientes-service', () => {
  const srv = app();

  test('sin token -> 401', async () => {
    const r = await request(srv).post('/api/solicitudes').send({});
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/token/i);
  });

  test('token invalido -> 401', async () => {
    const r = await request(srv).post('/api/solicitudes').set('Authorization', 'Bearer basura').send({});
    expect(r.status).toBe(401);
  });

  test('crear solicitud con rol admin -> 403 (solo medico_general)', async () => {
    const r = await request(srv).post('/api/solicitudes')
      .set('Authorization', `Bearer ${tokenConRol('admin')}`).send({});
    expect(r.status).toBe(403);
  });

  test('crear solicitud con rol medico_general -> 201', async () => {
    const r = await request(srv).post('/api/solicitudes')
      .set('Authorization', `Bearer ${tokenConRol('medico_general')}`).send({});
    expect(r.status).toBe(201);
  });

  test('asignar cita con rol medico_general -> 403 (solo coordinador o admin)', async () => {
    const r = await request(srv).patch('/api/solicitudes/1/asignar-cita')
      .set('Authorization', `Bearer ${tokenConRol('medico_general')}`).send({});
    expect(r.status).toBe(403);
  });

  test('asignar cita con rol coordinador_fundacion -> 200', async () => {
    const r = await request(srv).patch('/api/solicitudes/1/asignar-cita')
      .set('Authorization', `Bearer ${tokenConRol('coordinador_fundacion')}`).send({});
    expect(r.status).toBe(200);
  });

  test('convertir a visita con rol medico_general -> 403', async () => {
    const r = await request(srv).post('/api/solicitudes/1/convertir-a-visita')
      .set('Authorization', `Bearer ${tokenConRol('medico_general')}`).send({});
    expect(r.status).toBe(403);
  });

  test('convertir a visita con rol medico_especialista -> 201', async () => {
    const r = await request(srv).post('/api/solicitudes/1/convertir-a-visita')
      .set('Authorization', `Bearer ${tokenConRol('medico_especialista')}`).send({});
    expect(r.status).toBe(201);
  });

  test('GET de listar es publico para cualquier autenticado', async () => {
    const r = await request(srv).get('/api/solicitudes')
      .set('Authorization', `Bearer ${tokenConRol('enfermero')}`);
    expect(r.status).toBe(200);
  });
});
