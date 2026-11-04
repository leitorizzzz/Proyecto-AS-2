/**
 * Caso 14 del plan del SQA: cerrar una visita sin los campos obligatorios
 * se rechaza, la visita queda 'incompleta' y la API devuelve los campos
 * faltantes para que la UI los resalte. Una visita incompleta sigue
 * editable y se puede cerrar despues.
 */
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedicaController = require('../src/controllers/VisitaMedicaController');
const VisitaMedica = require('../src/models/VisitaMedica');

const visita = extra => new VisitaMedica({ id: 3, idSolicitudReferencia: 1, idPaciente: 1, idMedicoEspecialista: 2,
  estado: 'en_atencion', diagnostico: '', observaciones: '', ...extra });
const repoCon = v => ({
  obtenerPorId: jest.fn(async () => v),
  marcarIncompleta: jest.fn(async () => {}),
  actualizarClinico: jest.fn(async (_id, d) => ({ ...v, ...d })),
  completarConCargo: jest.fn(async () => ({ visita: { ...v, estado: 'completada' }, cargo: { id: 1, monto: 120 } }))
});

describe('Visita incompleta (caso 14)', () => {

  test('sin diagnostico ni observaciones -> 400, camposFaltantes y la visita pasa a incompleta', async () => {
    const repo = repoCon(visita());
    const err = await new VisitaMedicaService(repo, {}, {}).completar(3).catch(e => e);
    expect(err).toMatchObject({ status: 400, camposFaltantes: ['diagnostico', 'observaciones'], estadoVisita: 'incompleta' });
    expect(repo.marcarIncompleta).toHaveBeenCalledWith(3);
    expect(repo.completarConCargo).not.toHaveBeenCalled();
  });

  test('solo falta observaciones -> camposFaltantes = [observaciones]', async () => {
    const err = await new VisitaMedicaService(repoCon(visita({ diagnostico: 'HTA' })), {}, {}).completar(3).catch(e => e);
    expect(err.camposFaltantes).toEqual(['observaciones']);
    expect(err.message).toMatch(/faltan las observaciones/);
  });

  test('una visita incompleta se puede editar y luego cerrar', async () => {
    const v = visita({ estado: 'incompleta', diagnostico: 'HTA', observaciones: 'Control' });
    const svc = new VisitaMedicaService(repoCon(v), {}, {});
    await expect(svc.actualizarClinico(3, { diagnostico: 'HTA controlada' })).resolves.toBeDefined();
    await expect(svc.completar(3)).resolves.toMatchObject({ estado: 'completada' });
  });

  test('la API responde 400 con camposFaltantes y estadoVisita', async () => {
    const svc = { obtener: jest.fn(async () => visita()), completar: jest.fn(async () => {
      throw Object.assign(new Error('falta'), { status: 400, camposFaltantes: ['diagnostico'], estadoVisita: 'incompleta' });
    }) };
    const res = { status(c) { this.c = c; return this; }, json(b) { this.b = b; return this; } };
    await new VisitaMedicaController(svc, { registrar: jest.fn() }).completar({ params: { id: '3' }, usuario: {}, headers: {} }, res);
    expect(res.c).toBe(400);
    expect(res.b).toMatchObject({ camposFaltantes: ['diagnostico'], estadoVisita: 'incompleta' });
  });

  // Caso 14 del SQA (boton unico "Finalizar visita"): lo que la pantalla ve
  // a medio llenar tambien impide el cierre y deja la visita incompleta.
  test("con todo lleno pero una prescripcion a medio llenar -> 400, pendientes e incompleta", async () => {
    const repo = repoCon(visita({ diagnostico: "HTA", observaciones: "Control" }));
    const err = await new VisitaMedicaService(repo, {}, {})
      .completar(3, { pendientes: ["prescripción a medio llenar (falta la cantidad)"] }).catch(e => e);
    expect(err.status).toBe(400);
    expect(err.camposFaltantes).toEqual([]);
    expect(err.pendientes).toEqual(["prescripción a medio llenar (falta la cantidad)"]);
    expect(err.message).toMatch(/prescripción a medio llenar/);
    expect(repo.marcarIncompleta).toHaveBeenCalledWith(3);
    expect(repo.completarConCargo).not.toHaveBeenCalled();
  });

  test("pendientes que no son texto se ignoran y la visita se cierra", async () => {
    const repo = repoCon(visita({ diagnostico: "HTA", observaciones: "Control" }));
    await expect(new VisitaMedicaService(repo, {}, {}).completar(3, { pendientes: [null, 5, "  "] }))
      .resolves.toMatchObject({ estado: "completada" });
  });
});
