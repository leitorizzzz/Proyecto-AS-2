/**
 * Pruebas unitarias de NotificacionesService: modo simulacion, envio real
 * a Brevo (fetch simulado), reintento con espera creciente y paso a
 * fallida_definitiva al agotar los intentos.
 */
const NotificacionesService = require('../src/services/NotificacionesService');
const Notificacion = require('../src/models/Notificacion');

const ENV_ORIGINAL = { ...process.env };

function nuevoServicio({ simulacion = false, apiKey = 'xkeysib-test', maxIntentos = 3, obtenida = null } = {}) {
  process.env.MODO_SIMULACION = String(simulacion);
  process.env.BREVO_API_KEY = apiKey;
  process.env.NOTIF_MAX_INTENTOS = String(maxIntentos);
  process.env.NOTIF_ESPERA_BASE_SEG = '30';
  process.env.NOTIF_ESPERA_MAX_SEG = '300';
  const repo = {
    guardar: jest.fn(async n => ({ ...n, id: 1, intentos: 0 })),
    obtenerPorId: jest.fn(async () => obtenida),
    marcarEnviada: jest.fn(async () => {}),
    marcarFalloConReintento: jest.fn(async () => {}),
    marcarFalloDefinitivo: jest.fn(async () => {})
  };
  return { svc: new NotificacionesService(repo), repo };
}

const SOLICITUD = {
  idPaciente: 1, pacienteNombre: 'Rosa Gomez', especialidad: 'cardiologia',
  motivo: 'Control', familiarEmail: 'familia@example.com'
};

describe('NotificacionesService', () => {
  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
    delete global.fetch;
  });

  test('sin familiarEmail -> 400', async () => {
    const { svc } = nuevoServicio();
    await expect(svc.enviarCorreoSolicitud({ ...SOLICITUD, familiarEmail: null }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('modo simulacion: queda enviada sin llamar a Brevo', async () => {
    global.fetch = jest.fn();
    const { svc, repo } = nuevoServicio({ simulacion: true });
    const r = await svc.enviarCorreoSolicitud(SOLICITUD);
    expect(r.estado).toBe(Notificacion.ESTADOS.ENVIADA);
    expect(global.fetch).not.toHaveBeenCalled();
    // Caso 10: el log guarda un ID de mensaje que delata la simulacion.
    expect(repo.marcarEnviada).toHaveBeenCalledWith(1, 1, expect.stringMatching(/^sim-[0-9a-f-]{36}$/));
    expect(r.idMensajeProveedor).toMatch(/^sim-/);
  });

  test('envio real OK: guarda el messageId que devuelve Brevo (caso 10)', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 201,
      text: async () => JSON.stringify({ messageId: '<202610211200.123@smtp-relay.mailin.fr>' }) }));
    const { svc, repo } = nuevoServicio();
    const r = await svc.enviarCorreoSolicitud(SOLICITUD);
    expect(r).toMatchObject({ estado: 'enviada', idMensajeProveedor: '<202610211200.123@smtp-relay.mailin.fr>' });
    expect(repo.marcarEnviada).toHaveBeenCalledWith(1, 1, '<202610211200.123@smtp-relay.mailin.fr>');
  });

  test('envio real OK: POST a Brevo con api-key y destinatario', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => '' }));
    const { svc } = nuevoServicio();
    const r = await svc.enviarCorreoSolicitud(SOLICITUD);
    expect(r.estado).toBe(Notificacion.ESTADOS.ENVIADA);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body).to).toEqual([{ email: 'familia@example.com' }]);
  });

  test('Brevo falla con intentos restantes -> fallida y proximo intento en 30 s', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => 'Key not found' }));
    const { svc, repo } = nuevoServicio({ maxIntentos: 3 });
    const antes = Date.now();
    const r = await svc.enviarCorreoSolicitud(SOLICITUD);
    expect(r.estado).toBe(Notificacion.ESTADOS.FALLIDA);
    expect(r.mensajeError).toMatch(/401/);
    const [, intentos, proximo] = repo.marcarFalloConReintento.mock.calls[0];
    expect(intentos).toBe(1);
    expect(proximo.getTime() - antes).toBeGreaterThanOrEqual(30000);
    expect(proximo.getTime() - antes).toBeLessThan(31000);
  });

  test('Brevo falla en el ultimo intento -> fallida_definitiva', async () => {
    global.fetch = jest.fn(async () => { throw new Error('fetch failed'); });
    const { svc, repo } = nuevoServicio({ maxIntentos: 3 });
    const r = await svc.intentarEnvio({ id: 4, intentos: 2, maxIntentos: 3, destinatarioEmail: 'f@example.com' });
    expect(r.estado).toBe(Notificacion.ESTADOS.FALLIDA_DEFINITIVA);
    expect(repo.marcarFalloDefinitivo).toHaveBeenCalledWith(4, 3, 'fetch failed');
    expect(repo.marcarFalloConReintento).not.toHaveBeenCalled();
  });

  test('espera creciente con tope: 30, 60, 120, 240, 300 s', () => {
    const { svc } = nuevoServicio();
    const seg = n => Math.round((svc._calcularProximoIntento(n).getTime() - Date.now()) / 1000);
    expect([1, 2, 3, 4, 5].map(seg)).toEqual([30, 60, 120, 240, 300]);
  });

  test('reintento manual de una notificacion ya enviada -> 409', async () => {
    const { svc } = nuevoServicio({ obtenida: { id: 1, estado: Notificacion.ESTADOS.ENVIADA } });
    await expect(svc.reintentarManual(1)).rejects.toMatchObject({ status: 409 });
  });
});

describe('Correo de recuperacion de contrasena (RF-42)', () => {
  test('queda en el log (simulacion) y la API nunca devuelve el enlace', async () => {
    process.env.MODO_SIMULACION = 'true';
    const guardadas = [];
    const repo = {
      guardar: jest.fn(async n => { const g = { ...n, id: 9, intentos: 0 }; guardadas.push(g); return g; }),
      marcarEnviada: jest.fn(async () => {}),
      listar: jest.fn(async () => guardadas),
      obtenerPorId: jest.fn(async () => guardadas[0])
    };
    const svc = new NotificacionesService(repo);
    const r = await svc.enviarCorreoRecuperacion({ email: 'ana@asilo.gt', nombre: 'Ana', enlace: 'http://x/#restablecer=SECRETO', minutos: 30 });
    expect(r).toMatchObject({ estado: 'enviada', tipoEvento: 'recuperacion_password', idMensajeProveedor: expect.stringMatching(/^sim-/) });
    expect(guardadas[0].cuerpo).toContain('SECRETO');          // queda para los reintentos
    expect(JSON.stringify(r)).not.toContain('SECRETO');
    expect(JSON.stringify(await svc.logNotificaciones({}))).not.toContain('SECRETO');
    expect(JSON.stringify(await svc.obtenerPorId(9))).not.toContain('SECRETO');
    await expect(svc.enviarCorreoRecuperacion({ email: 'ana@asilo.gt' })).rejects.toMatchObject({ status: 400 });
  });

  test('POST /recuperacion solo con el JWT de servicio (rol sistema)', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const express = require('express');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const crearRutas = require('../src/routes/notificacionesRoutes');
    const ok = (_r, res) => res.status(201).json({});
    const a = express(); a.use(express.json());
    a.use('/api/notificaciones', crearRutas({ enviarSolicitud: ok, enviarRecuperacion: ok, log: ok, obtener: ok, reintentar: ok }));
    const tk = rol => `Bearer ${jwt.sign({ sub: 1, email: 'x', rol }, process.env.JWT_SECRET)}`;
    expect((await request(a).post('/api/notificaciones/recuperacion').set('Authorization', tk('sistema')).send({})).status).toBe(201);
    expect((await request(a).post('/api/notificaciones/recuperacion').set('Authorization', tk('admin')).send({})).status).toBe(403);
    expect((await request(a).post('/api/notificaciones/recuperacion').send({})).status).toBe(401);
  });
});
