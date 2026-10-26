/**
 * Pruebas RBAC de notificaciones-service (auditoria SQA, 26 oct).
 * El aviso de solicitud solo lo dispara el medico general (pacientes-service
 * reenvia su JWT); antes cualquier rol podia mandar un correo a cualquier
 * direccion. Controller stub, sin BD ni Brevo.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasNotificaciones = require('../src/routes/notificacionesRoutes');

const token = rol => jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });

function app() {
  const ok = (_r, res) => res.status(201).json({ id: 1 });
  const ctrl = { enviarSolicitud: ok, enviarRecuperacion: ok, log: (_r, res) => res.json([]), obtener: (_r, res) => res.json({}), reintentar: (_r, res) => res.json({}) };
  const a = express();
  a.use(express.json());
  a.use('/api/notificaciones', crearRutasNotificaciones(ctrl));
  return a;
}

describe('RBAC notificaciones-service', () => {
  test('POST /solicitud sin token -> 401', async () => {
    expect((await request(app()).post('/api/notificaciones/solicitud').send({})).status).toBe(401);
  });

  test.each(['admin', 'enfermero', 'medico_especialista', 'coordinador_fundacion', 'farmacia', 'laboratorio', 'sistema'])
  ('POST /solicitud con rol %s -> 403', async rol => {
    const r = await request(app()).post('/api/notificaciones/solicitud').set('Authorization', `Bearer ${token(rol)}`).send({ familiarEmail: 'otro@example.com' });
    expect(r.status).toBe(403);
  });

  test('POST /solicitud con medico_general -> pasa', async () => {
    const r = await request(app()).post('/api/notificaciones/solicitud').set('Authorization', `Bearer ${token('medico_general')}`).send({});
    expect(r.status).toBe(201);
  });

  test('POST /recuperacion solo el JWT de servicio (rol sistema)', async () => {
    expect((await request(app()).post('/api/notificaciones/recuperacion').set('Authorization', `Bearer ${token('admin')}`).send({})).status).toBe(403);
    expect((await request(app()).post('/api/notificaciones/recuperacion').set('Authorization', `Bearer ${token('sistema')}`).send({})).status).toBe(201);
  });

  test('reintentar solo admin', async () => {
    expect((await request(app()).post('/api/notificaciones/1/reintentar').set('Authorization', `Bearer ${token('farmacia')}`)).status).toBe(403);
    expect((await request(app()).post('/api/notificaciones/1/reintentar').set('Authorization', `Bearer ${token('admin')}`)).status).toBe(200);
  });
});
