/**
 * Caso 24: la auditoria registra la IP real del cliente. Express solo
 * confia en el proxy (nginx del frontend); un X-Forwarded-For enviado por
 * cualquier otro se ignora.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const crearConfianzaProxy = require('../src/middleware/confianzaProxy');
const AuditoriaService = require('../src/services/AuditoriaService');

function app(confianza) {
  const a = express();
  a.set('trust proxy', confianza);
  a.get('/ip', (req, res) => res.json(AuditoriaService.contextoDe(req, 'pacientes')));
  return a;
}

describe('IP del cliente detras del nginx (caso 24)', () => {
  test('desde el proxy de confianza: la IP es la que agrego nginx al final de X-Forwarded-For', async () => {
    const srv = app(crearConfianzaProxy({ hosts: '127.0.0.1', intervaloMs: 0 }));
    const r = await request(srv).get('/ip').set('X-Forwarded-For', '198.51.100.7');
    expect(r.body).toMatchObject({ ip: '198.51.100.7', modulo: 'pacientes' });
  });

  test('un valor inventado por el cliente antes del de nginx no se toma', async () => {
    const srv = app(crearConfianzaProxy({ hosts: '127.0.0.1', intervaloMs: 0 }));
    // nginx: $proxy_add_x_forwarded_for = "<lo que mando el cliente>, <IP real>"
    const r = await request(srv).get('/ip').set('X-Forwarded-For', '6.6.6.6, 198.51.100.7');
    expect(r.body.ip).toBe('198.51.100.7');
  });

  test('llamada directa al puerto (sin pasar por el proxy): se ignora X-Forwarded-For', async () => {
    const srv = app(crearConfianzaProxy({ hosts: '10.9.9.9', intervaloMs: 0 }));
    const r = await request(srv).get('/ip').set('X-Forwarded-For', '198.51.100.7');
    expect(r.body.ip).toBe('127.0.0.1');
  });

  test('los nombres se resuelven por DNS (servicio "frontend" de docker compose)', async () => {
    const lookup = jest.fn((host, opts, cb) => cb(null, [{ address: '172.20.0.9', family: 4 }]));
    const confiar = crearConfianzaProxy({ hosts: 'frontend', intervaloMs: 0, lookup });
    await confiar.listo;
    expect(lookup).toHaveBeenCalledWith('frontend', { all: true }, expect.any(Function));
    expect(confiar('::ffff:172.20.0.9', 0)).toBe(true);
    expect(confiar('172.20.0.9', 1)).toBe(false); // solo el salto inmediato
    expect(confiar('172.20.0.10', 0)).toBe(false);
  });

  test('TRUST_PROXY_HOST vacio: no se confia en nadie', () => {
    const confiar = crearConfianzaProxy({ hosts: '', intervaloMs: 0 });
    expect(confiar('127.0.0.1', 0)).toBe(false);
  });

  test('las 4 copias (auth, pacientes, farmacia, financiero) son identicas y estan activas', () => {
    const raiz = path.join(__dirname, '..', '..');
    const leer = (sv, f) => fs.readFileSync(path.join(raiz, `${sv}-service`, 'src', f), 'utf8').replace(/\r\n/g, '\n');
    const base = leer('pacientes', 'middleware/confianzaProxy.js');
    const baseAud = leer('pacientes', 'services/AuditoriaService.js');
    for (const sv of ['auth', 'farmacia', 'financiero']) {
      expect(leer(sv, 'middleware/confianzaProxy.js')).toBe(base);
      expect(leer(sv, 'services/AuditoriaService.js')).toBe(baseAud);
    }
    for (const sv of ['auth', 'pacientes', 'farmacia', 'financiero']) {
      expect(leer(sv, 'app.js')).toMatch(/app\.set\('trust proxy', require\('\.\/middleware\/confianzaProxy'\)\(\)\)/);
    }
  });
});
