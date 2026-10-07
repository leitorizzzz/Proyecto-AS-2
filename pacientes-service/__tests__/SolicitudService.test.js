/**
 * Pruebas unitarias de SolicitudService.
 * Cubren RN-02 y la inmutabilidad de estados de solicitudes.
 */
const SolicitudService = require('../src/services/SolicitudService');
const SolicitudReferencia = require('../src/models/SolicitudReferencia');

function crearRepoMock(estadoInicial = {}) {
  const estado = { ...estadoInicial };
  return {
    _estado: estado,
    obtenerTodas: jest.fn(async () => Object.values(estado.solicitudes || {})),
    obtenerPorId: jest.fn(async id => estado.solicitudes?.[id] || null),
    obtenerPorPaciente: jest.fn(async () => []),
    existeSolicitudActiva: jest.fn(async (idPac, esp) => !!estado.activa),
    guardar: jest.fn(async sol => {
      sol.id = 999;
      estado.solicitudes = { ...(estado.solicitudes || {}), 999: sol };
      return sol;
    }),
    asignarCita: jest.fn(async (id, _datos) => estado.solicitudes[id]),
    cambiarEstado: jest.fn(async (id, nuevo) => {
      estado.solicitudes[id].estado = nuevo;
      return estado.solicitudes[id];
    })
  };
}
const pacienteRepoMock = {
  obtenerPorId: jest.fn(async id => id ? { id, nombres: 'X', apellidos: 'Y', familiarEmail: null } : null)
};

describe('SolicitudService', () => {

  test('crear OK: paciente valido, especialidad y motivo', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock);
    const r = await svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'dolor' }, 42);
    expect(r.estado).toBe(SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION);
    expect(r.idMedicoGeneral).toBe(42);
    expect(repo.guardar).toHaveBeenCalled();
  });

  test('RN-02: segunda solicitud activa en misma especialidad -> 409', async () => {
    const repo = crearRepoMock({ activa: true });
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(
      svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'x' }, 42)
    ).rejects.toMatchObject({ status: 409 });
  });

  test('crear sin motivo -> 400', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(
      svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: '' }, 42)
    ).rejects.toMatchObject({ status: 400 });
  });

  test('obtener no existente -> 404', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(svc.obtener(123)).rejects.toMatchObject({ status: 404 });
  });

  test('asignar cita en estado incorrecto -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.CITA_ASIGNADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(svc.asignarCita(1, {
      fechaCita: '2026-12-01', horaCita: '10:00', idMedicoEspecialista: 2
    })).rejects.toMatchObject({ status: 409 });
  });

  test('inmutabilidad: cancelar completada -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.COMPLETADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(svc.cancelar(1)).rejects.toMatchObject({ status: 409 });
  });

  test('inmutabilidad: cancelar ya cancelada -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.CANCELADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock);
    await expect(svc.cancelar(1)).rejects.toMatchObject({ status: 409 });
  });

  test('cancelar activa (pendiente_asignacion) -> OK', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock);
    const r = await svc.cancelar(1);
    expect(r.estado).toBe(SolicitudReferencia.ESTADOS.CANCELADA);
  });
});
