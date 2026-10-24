/**
 * Limite de intentos: 5 fallos por IP + usuario en 15 minutos en login y
 * en /recuperar -> 429 con mensaje claro y Retry-After. La IP es la real
 * (req.ip con trust proxy).
 */
process.env.JWT_SECRET = 'test-secret-limite';
const express = require('express');
const request = require('supertest');
const LimitadorIntentos = require('../src/services/LimitadorIntentos');
const AuthController = require('../src/controllers/AuthController');
const crearRutasAuth = require('../src/routes/authRoutes');
const crearConfianzaProxy = require('../src/middleware/confianzaProxy');

const QUINCE_MIN = 15 * 60 * 1000;

describe('LimitadorIntentos', () => {
  test('5 fallos permitidos; el sexto intento queda bloqueado hasta que vence la ventana', () => {
    let t = 0;
    const l = new LimitadorIntentos({ maximo: 5, ventanaMs: QUINCE_MIN, ahora: () => t });
    const k = LimitadorIntentos.clave('login', '::ffff:10.0.0.1', 'Ana@Asilo.gt ');
    expect(k).toBe('login|10.0.0.1|ana@asilo.gt');
    for (let i = 0; i < 5; i++) { expect(l.bloqueo(k)).toBeNull(); l.registrarFallo(k); }
    expect(l.bloqueo(k)).toEqual({ segundos: 900 });
    t = QUINCE_MIN - 60 * 1000;
    expect(l.bloqueo(k)).toEqual({ segundos: 60 });
    t = QUINCE_MIN;
    expect(l.bloqueo(k)).toBeNull();
  });

  test('la clave es por IP + usuario: otra IP u otro usuario no se bloquean', () => {
    const l = new LimitadorIntentos({ maximo: 5, ventanaMs: QUINCE_MIN });
    const k = LimitadorIntentos.clave('login', '10.0.0.1', 'ana@asilo.gt');
    for (let i = 0; i < 5; i++) l.registrarFallo(k);
    expect(l.bloqueo(k)).not.toBeNull();
    expect(l.bloqueo(LimitadorIntentos.clave('login', '10.0.0.2', 'ana@asilo.gt'))).toBeNull();
    expect(l.bloqueo(LimitadorIntentos.clave('login', '10.0.0.1', 'otro@asilo.gt'))).toBeNull();
    expect(l.bloqueo(LimitadorIntentos.clave('recuperar', '10.0.0.1', 'ana@asilo.gt'))).toBeNull();
  });

  test('limpiar borra ventanas vencidas y hay tope de memoria', () => {
    let t = 0;
    const l = new LimitadorIntentos({ maximo: 5, ventanaMs: 1000, maxClaves: 3, ahora: () => t });
    for (const u of ['a', 'b', 'c', 'd']) l.registrarFallo(LimitadorIntentos.clave('login', '1.1.1.1', u));
    expect(l.registros.size).toBe(3);
    t = 5000; l.limpiar();
    expect(l.registros.size).toBe(0);
  });

  test('mensaje claro en espanol', () => {
    expect(LimitadorIntentos.mensaje(900)).toBe('Demasiados intentos. Por seguridad, espere 15 minutos antes de volver a intentarlo.');
    expect(LimitadorIntentos.mensaje(30)).toMatch(/espere 1 minuto antes/);
  });
});

describe('Login y /recuperar con limite (via HTTP, IP real tras el proxy)', () => {
  function app() {
    const usuarios = { 'ana@asilo.gt': 'Demo1234' };
    const service = {
      login: jest.fn(async ({ email, password }) => {
        if (usuarios[email] !== password) throw new Error('Credenciales invalidas');
        return { token: 't' };
      })
    };
    const recuperacion = { solicitar: jest.fn(async () => ({ enviado: false })) };
    const limitador = new LimitadorIntentos({ maximo: 5, ventanaMs: QUINCE_MIN });
    const ctrl = new AuthController(service, null, recuperacion, limitador);
    const a = express();
    a.set('trust proxy', crearConfianzaProxy({ hosts: '127.0.0.1', intervaloMs: 0 })); // supertest = el "nginx"
    a.use(express.json());
    a.use('/api/auth', crearRutasAuth(ctrl));
    return { a, service };
  }
  const loginDesde = (a, ip, password) => request(a).post('/api/auth/login')
    .set('X-Forwarded-For', ip).send({ email: 'ana@asilo.gt', password });

  test('5 contrasenas malas -> 401; la sexta (aunque sea correcta) -> 429 con Retry-After', async () => {
    const { a, service } = app();
    for (let i = 0; i < 5; i++) expect((await loginDesde(a, '198.51.100.1', 'mala')).status).toBe(401);
    const r = await loginDesde(a, '198.51.100.1', 'Demo1234');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/Demasiados intentos/);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(800);
    expect(service.login).toHaveBeenCalledTimes(5); // bloqueado sin consultar credenciales
    // Otra IP real (otro cliente detras del mismo nginx) entra normal.
    expect((await loginDesde(a, '198.51.100.2', 'Demo1234')).status).toBe(200);
  });

  test('un login correcto reinicia el contador', async () => {
    const { a } = app();
    for (let i = 0; i < 4; i++) await loginDesde(a, '198.51.100.3', 'mala');
    expect((await loginDesde(a, '198.51.100.3', 'Demo1234')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await loginDesde(a, '198.51.100.3', 'mala')).status).toBe(401);
  });

  test('/recuperar: 5 solicitudes 200 (mismo mensaje), la sexta 429; correo inexistente igual', async () => {
    for (const email of ['ana@asilo.gt', 'no.existe@asilo.gt']) {
      const { a } = app();
      const pedir = () => request(a).post('/api/auth/recuperar').set('X-Forwarded-For', '198.51.100.9').send({ email });
      for (let i = 0; i < 5; i++) expect((await pedir()).status).toBe(200);
      const r = await pedir();
      expect(r.status).toBe(429);
      expect(r.body.error).toMatch(/Demasiados intentos/);
    }
  });
});
