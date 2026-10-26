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
    existeSolicitudActiva: jest.fn(async (idPac, esp) => (estado.activa ? { id: 31, estado: 'cita_asignada' } : null)),
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

// Caso 7: el enfermero asignado debe ser un enfermero activo.
const usuarioRepoMock = {
  obtenerPorId: jest.fn(async id => (id === 8 ? { id: 8, nombre: 'Enf. Patricia', rol: 'enfermero', activo: true }
    : id === 9 ? { id: 9, nombre: 'Farmacia', rol: 'farmacia', activo: true }
    : id === 7 ? { id: 7, nombre: 'Dr. Especialista', rol: 'medico_especialista', activo: true } : null))
};

describe('SolicitudService', () => {

  test('crear OK: paciente valido, especialidad y motivo', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    const r = await svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'dolor', idEnfermero: 8 }, 42);
    expect(r.estado).toBe(SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION);
    expect(r.idMedicoGeneral).toBe(42);
    expect(r.idEnfermero).toBe(8);
    expect(repo.guardar).toHaveBeenCalled();
  });

  test('RN-02: segunda solicitud activa en misma especialidad -> 409', async () => {
    const repo = crearRepoMock({ activa: true });
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(
      svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'x', idEnfermero: 8 }, 42)
    ).rejects.toMatchObject({ status: 409, solicitudActiva: { id: 31, estado: 'cita_asignada' },
                              message: expect.stringMatching(/solicitud #31/) });
  });

  test('crear sin enfermero asignado -> 400', async () => {
    const svc = new SolicitudService(crearRepoMock(), pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'x' }, 42))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/idEnfermero es requerido/) });
  });

  test('crear con un usuario que no es enfermero -> 400', async () => {
    const svc = new SolicitudService(crearRepoMock(), pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'x', idEnfermero: 9 }, 42))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no es un enfermero activo/) });
  });

  test('asignar cita crea avisos para el medico general y el enfermero (caso 12)', async () => {
    const repo = crearRepoMock({ solicitudes: { 5: { id: 5, idPaciente: 1, idMedicoGeneral: 42, idEnfermero: 8,
      especialidad: 'cardiologia', estado: 'pendiente_asignacion' } } });
    repo.asignarCitaConAvisos = jest.fn(async (id) => ({ id, estado: 'cita_asignada' }));
    const avisoRepo = {};
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock, avisoRepo);
    await svc.asignarCita(5, { fechaCita: '2099-12-01', horaCita: '10:00', idMedicoEspecialista: 7 });
    const [, datos, avisos, repoAvisos] = repo.asignarCitaConAvisos.mock.calls[0];
    expect(datos).toEqual({ fechaCita: '2099-12-01', horaCita: '10:00', idMedicoEspecialista: 7 });
    expect(avisos.map(a => a.idUsuario).sort((x, y) => x - y)).toEqual([8, 42]);
    expect(avisos[0]).toMatchObject({ tipo: 'cita_asignada', idSolicitud: 5, mensaje: expect.stringMatching(/2099-12-01 10:00/) });
    expect(repoAvisos).toBe(avisoRepo);
  });

  test('crear sin motivo -> 400', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(
      svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: '' }, 42)
    ).rejects.toMatchObject({ status: 400 });
  });

  test('obtener no existente -> 404', async () => {
    const repo = crearRepoMock();
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.obtener(123)).rejects.toMatchObject({ status: 404 });
  });

  test('asignar cita en estado incorrecto -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.CITA_ASIGNADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.asignarCita(1, {
      fechaCita: '2099-12-01', horaCita: '10:00', idMedicoEspecialista: 2
    })).rejects.toMatchObject({ status: 409 });
  });

  test('inmutabilidad: cancelar completada -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.COMPLETADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.cancelar(1)).rejects.toMatchObject({ status: 409 });
  });

  test('inmutabilidad: cancelar ya cancelada -> 409', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.CANCELADA })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    await expect(svc.cancelar(1)).rejects.toMatchObject({ status: 409 });
  });

  test('cancelar activa (pendiente_asignacion) -> OK', async () => {
    const repo = crearRepoMock({
      solicitudes: { 1: new SolicitudReferencia({ id: 1, idPaciente: 1, idMedicoGeneral: 1,
        especialidad: 'c', motivo: 'm', estado: SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION })}
    });
    const svc = new SolicitudService(repo, pacienteRepoMock, null, usuarioRepoMock);
    const r = await svc.cancelar(1);
    expect(r.estado).toBe(SolicitudReferencia.ESTADOS.CANCELADA);
  });
});
