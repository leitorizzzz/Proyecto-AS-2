/**
 * GET /api/auditoria: validaciones de AuditoriaService (lector, en
 * reportes-service) y RBAC de la ruta (solo admin).
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const AuditoriaService = require('../src/services/AuditoriaService');
const crearRutasAuditoria = require('../src/routes/auditoriaRoutes');

const repoMock = () => ({ listar: jest.fn(async () => []) });

describe('AuditoriaService (lector)', () => {

  test('sin filtros: limite 200 y sin fechas', async () => {
    const repo = repoMock();
    await new AuditoriaService(repo).listar();
    expect(repo.listar).toHaveBeenCalledWith({ desde: null, hasta: null, entidad: null, idEntidad: null, limite: 200 });
  });

  test('hasta en YYYY-MM-DD incluye el dia completo (exclusivo al dia siguiente)', async () => {
    const repo = repoMock();
    await new AuditoriaService(repo).listar({ desde: '2026-10-01', hasta: '2026-10-20' });
    const { desde, hasta } = repo.listar.mock.calls[0][0];
    expect(desde.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-10-21T00:00:00.000Z');
  });

  test('instantes ISO se respetan tal cual (limites del dia local del frontend)', async () => {
    const repo = repoMock();
    await new AuditoriaService(repo).listar({ desde: '2026-10-20T06:00:00.000Z', hasta: '2026-10-21T06:00:00.000Z' });
    expect(repo.listar.mock.calls[0][0].hasta.toISOString()).toBe('2026-10-21T06:00:00.000Z');
  });

  test('fecha invalida -> 400; desde >= hasta -> 400', async () => {
    const svc = new AuditoriaService(repoMock());
    await expect(svc.listar({ desde: 'ayer' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.listar({ desde: '2026-10-21', hasta: '2026-10-20' })).rejects.toMatchObject({ status: 400 });
  });

  test('entidad desconocida -> 400; idEntidad no entero -> 400', async () => {
    const svc = new AuditoriaService(repoMock());
    await expect(svc.listar({ entidad: 'planeta' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.listar({ idEntidad: 'abc' })).rejects.toMatchObject({ status: 400 });
  });

  test('limite mayor a 1000 se recorta a 1000', async () => {
    const repo = repoMock();
    await new AuditoriaService(repo).listar({ limite: '5000', entidad: 'paciente', idEntidad: '4' });
    expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({ limite: 1000, entidad: 'paciente', idEntidad: 4 }));
  });

  test('si la tabla aun no existe (error 208) devuelve lista vacia', async () => {
    const repo = { listar: jest.fn(async () => { throw Object.assign(new Error("Invalid object name 'auditoria'"), { number: 208 }); }) };
    await expect(new AuditoriaService(repo).listar()).resolves.toEqual([]);
  });
});

describe('RBAC GET /api/auditoria', () => {
  const app = express();
  app.use('/api/auditoria', crearRutasAuditoria({ listar: (_r, res) => res.json([]) }));
  const con = rol => ({ Authorization: `Bearer ${jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET)}` });

  test('sin token -> 401', async () => {
    expect((await request(app).get('/api/auditoria')).status).toBe(401);
  });

  test('rol coordinador_fundacion -> 403', async () => {
    expect((await request(app).get('/api/auditoria').set(con('coordinador_fundacion'))).status).toBe(403);
  });

  test('rol admin -> 200', async () => {
    expect((await request(app).get('/api/auditoria').set(con('admin'))).status).toBe(200);
  });
});
