/**
 * Manejo de errores HTTP (auditoria SQA, 26 oct): ningun 500 muestra el
 * mensaje interno (SQL Server, rutas) y un JSON malformado responde 400 en
 * JSON, no la pagina HTML de Express con la traza. El middleware es una
 * copia identica en los 7 servicios e instalada en cada app.js.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { ocultarErrores500, manejadorErrores, MENSAJE_500 } = require('../src/middleware/manejoErrores');

function app() {
  const a = express();
  a.use(express.json({ limit: '1kb' }));
  a.use(ocultarErrores500);
  a.post('/eco', (req, res) => res.status(201).json(req.body));
  a.get('/sql', (_req, res) => res.status(500).json({ error: "Cannot insert the value NULL into column 'monto'" }));
  a.get('/negocio', (_req, res) => res.status(409).json({ error: 'El cargo ya está pagado' }));
  a.get('/lanza', () => { throw new Error('ECONNREFUSED 172.18.0.2:1433'); });
  a.use(manejadorErrores);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  return a;
}

describe('manejoErrores', () => {
  test('un 500 con mensaje de SQL sale con el mensaje genérico', async () => {
    const r = await request(app()).get('/sql');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: MENSAJE_500 });
  });
  test('los errores de negocio (4xx) conservan su mensaje', async () => {
    const r = await request(app()).get('/negocio');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('El cargo ya está pagado');
  });
  test('una excepción no atrapada -> 500 JSON sin detalle', async () => {
    const r = await request(app()).get('/lanza');
    expect(r.status).toBe(500);
    expect(r.headers['content-type']).toMatch(/json/);
    expect(JSON.stringify(r.body)).not.toMatch(/172\.18|ECONNREFUSED/);
  });
  test('JSON malformado -> 400 JSON, sin traza HTML', async () => {
    const r = await request(app()).post('/eco').set('Content-Type', 'application/json').send('{"nombres":');
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toMatch(/json/);
    expect(r.body.error).toMatch(/JSON válido/);
    expect(r.text).not.toMatch(/node_modules|<pre>/);
  });
  test('cuerpo demasiado grande -> 413 JSON', async () => {
    const r = await request(app()).post('/eco').send({ x: 'a'.repeat(5000) });
    expect(r.status).toBe(413);
  });
  test('una respuesta correcta no se altera', async () => {
    const r = await request(app()).post('/eco').send({ nombres: 'José' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ nombres: 'José' });
  });

  const raiz = path.join(__dirname, '..', '..');
  const original = fs.readFileSync(path.join(__dirname, '../src/middleware/manejoErrores.js'), 'utf8').replace(/\r\n/g, '\n');
  test.each(['auth', 'farmacia', 'pacientes', 'laboratorio', 'financiero', 'reportes', 'notificaciones'])
  ('%s-service: copia idéntica e instalada en app.js', s => {
    const copia = fs.readFileSync(path.join(raiz, `${s}-service/src/middleware/manejoErrores.js`), 'utf8').replace(/\r\n/g, '\n');
    expect(copia).toBe(original);
    const appJs = fs.readFileSync(path.join(raiz, `${s}-service/src/app.js`), 'utf8');
    expect(appJs).toMatch(/app\.use\(express\.json\(\)\);\r?\napp\.use\(ocultarErrores500\);/);
    expect(appJs).toMatch(/app\.use\(manejadorErrores\);/);
  });
});
