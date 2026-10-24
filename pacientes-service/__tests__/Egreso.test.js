/**
 * Caso 6 del plan del SQA: el egreso es una baja logica que guarda fecha y
 * motivo; sin motivo -> 400; queda en la auditoria con antes/despues.
 */
const PacienteService = require('../src/services/PacienteService');
const PacienteController = require('../src/controllers/PacienteController');

function nuevo(paciente = { id: 4, nombres: 'Rosa', apellidos: 'Gomez', activo: true, fechaIngreso: '2020-01-10T00:00:00.000Z' }) {
  const repo = {
    obtenerPorId: jest.fn(async () => paciente),
    cambiarActivo: jest.fn(async (id, activo, egreso = {}) => ({ ...paciente, id, activo, ...egreso }))
  };
  return { svc: new PacienteService(repo), repo };
}

describe('Egreso del paciente (caso 6)', () => {
  test('sin motivo -> 400 y no se toca el registro', async () => {
    const { svc, repo } = nuevo();
    for (const datos of [undefined, {}, { motivoEgreso: '  ' }, { motivoEgreso: 'ab' }, { motivoEgreso: 'x'.repeat(301) }]) {
      await expect(svc.desactivar(4, datos)).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.cambiarActivo).not.toHaveBeenCalled();
  });

  test('con motivo y fecha: guarda ambos (fecha a mediodia de Guatemala)', async () => {
    const { svc, repo } = nuevo();
    const r = await svc.desactivar(4, { motivoEgreso: ' Traslado con su familia ', fechaEgreso: '2026-10-01' });
    expect(repo.cambiarActivo).toHaveBeenCalledWith(4, false,
      { fechaEgreso: new Date('2026-10-01T18:00:00Z'), motivoEgreso: 'Traslado con su familia' });
    expect(r).toMatchObject({ activo: false, motivoEgreso: 'Traslado con su familia' });
  });

  test('sin fecha: hoy', async () => {
    const { svc, repo } = nuevo();
    await svc.desactivar(4, { motivoEgreso: 'Fallecimiento' });
    const fecha = repo.cambiarActivo.mock.calls[0][2].fechaEgreso;
    expect(Math.abs(fecha.getTime() - Date.now())).toBeLessThan(30 * 60 * 60 * 1000);
  });

  test('fecha invalida, futura o anterior al ingreso -> 400', async () => {
    const { svc } = nuevo();
    await expect(svc.desactivar(4, { motivoEgreso: 'Traslado', fechaEgreso: '01/10/2026' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.desactivar(4, { motivoEgreso: 'Traslado', fechaEgreso: '2999-01-01' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.desactivar(4, { motivoEgreso: 'Traslado', fechaEgreso: '2019-12-31' })).rejects.toMatchObject({ status: 400 });
  });

  test('el controlador pasa el cuerpo y audita el egreso con antes y despues', async () => {
    const { svc } = nuevo();
    const auditoria = { registrar: jest.fn(async () => ({})) };
    const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const req = { params: { id: '4' }, body: { motivoEgreso: 'Traslado', fechaEgreso: '2026-10-01' },
                  usuario: { sub: 1, email: 'admin@asilo.gt' }, ip: '10.0.0.8', headers: {} };
    await new PacienteController(svc, auditoria).desactivar(req, res);
    expect(res.body).toMatchObject({ activo: false, motivoEgreso: 'Traslado' });
    const [ctx, accion, entidad, id, detalle, datos] = auditoria.registrar.mock.calls[0];
    expect([ctx.ip, accion, entidad, id]).toEqual(['10.0.0.8', 'desactivar', 'paciente', 4]);
    expect(detalle).toBe('egreso de Rosa Gomez: Traslado');
    expect(datos.antes).toMatchObject({ activo: true });
    expect(datos.despues).toMatchObject({ activo: false, motivoEgreso: 'Traslado', fechaEgreso: new Date('2026-10-01T18:00:00Z') });
  });

  test('sin motivo el controlador responde 400', async () => {
    const { svc } = nuevo();
    const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await new PacienteController(svc, { registrar: jest.fn() }).desactivar({ params: { id: '4' }, body: {}, headers: {} }, res);
    expect(res.code).toBe(400);
  });
});
