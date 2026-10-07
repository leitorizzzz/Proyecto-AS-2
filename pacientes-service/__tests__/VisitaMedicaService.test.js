/**
 * Pruebas unitarias de VisitaMedicaService.
 * Cubren: diagnostico+observaciones obligatorios para completar e
 * inmutabilidad de visitas completadas.
 */
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedica = require('../src/models/VisitaMedica');

function crearSolicitudServiceMock(estado) {
  return {
    obtener: jest.fn(async () => ({ id: 1, estado, idPaciente: 10 })),
    marcarEnAtencion: jest.fn(async () => {}),
    marcarCompletada: jest.fn(async () => {})
  };
}

function crearRepoMock(visita) {
  return {
    obtenerPorId: jest.fn(async () => visita),
    obtenerPorSolicitud: jest.fn(async () => null),
    guardar: jest.fn(async v => ({ ...v, id: 1 })),
    actualizarClinico: jest.fn(async (_id, d) => ({ ...visita, ...d })),
    marcarCompletada: jest.fn(async () => ({ ...visita, estado: VisitaMedica.ESTADOS.COMPLETADA })),
    agregarExamen: jest.fn(async () => ({ id: 1 })),
    agregarPrescripcion: jest.fn(async () => ({ id: 1 }))
  };
}

describe('VisitaMedicaService', () => {

  test('completar sin diagnostico -> 400', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: '', observaciones: 'ok' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('en_atencion'));
    await expect(svc.completar(1)).rejects.toMatchObject({ status: 400 });
  });

  test('completar sin observaciones -> 400', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: 'HTA', observaciones: '' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('en_atencion'));
    await expect(svc.completar(1)).rejects.toMatchObject({ status: 400 });
  });

  test('completar OK con diagnostico y observaciones', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: 'HTA', observaciones: 'Seguir' });
    const solicSvc = crearSolicitudServiceMock('en_atencion');
    const svc = new VisitaMedicaService(crearRepoMock(visita), solicSvc);
    const r = await svc.completar(1);
    expect(r.estado).toBe(VisitaMedica.ESTADOS.COMPLETADA);
    expect(solicSvc.marcarCompletada).toHaveBeenCalledWith(visita.idSolicitudReferencia);
  });

  test('inmutabilidad: editar visita completada -> 409', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'completada' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('completada'));
    await expect(svc.actualizarClinico(1, { diagnostico: 'x', observaciones: 'y' }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('agregar prescripcion con idMedicamento se envia al repo', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion' });
    const repo = crearRepoMock(visita);
    const svc = new VisitaMedicaService(repo, crearSolicitudServiceMock('en_atencion'));
    await svc.agregarPrescripcion(1, { medicamento: 'Losartan', idMedicamento: 2, dosis: '1/24h' });
    expect(repo.agregarPrescripcion).toHaveBeenCalledWith(1, expect.objectContaining({
      medicamento: 'Losartan', idMedicamento: 2
    }));
  });
});
