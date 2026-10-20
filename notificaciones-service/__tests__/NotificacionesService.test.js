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
    expect(repo.marcarEnviada).toHaveBeenCalledWith(1, 1);
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
