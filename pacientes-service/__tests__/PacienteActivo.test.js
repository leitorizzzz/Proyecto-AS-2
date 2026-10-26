/**
 * Regla "paciente activo" (borrado logico): un paciente desactivado no
 * recibe solicitudes, citas, visitas, examenes ni prescripciones.
 * Tambien desactivar / reactivar en PacienteService.
 */
const { asegurarPacienteActivo } = require('../src/services/reglasPaciente');
const PacienteService = require('../src/services/PacienteService');
const SolicitudService = require('../src/services/SolicitudService');
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedica = require('../src/models/VisitaMedica');

const pacienteRepo = (activo = true, existe = true) => ({
  obtenerPorId: jest.fn(async id => (existe ? { id, nombres: 'Rosa', apellidos: 'Gomez', activo } : null))
});

describe('Regla paciente activo', () => {

  test('asegurarPacienteActivo: paciente desactivado -> 409 con su nombre', async () => {
    await expect(asegurarPacienteActivo(pacienteRepo(false), 1, 'crear solicitudes'))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Rosa Gomez esta desactivado: no se puede crear solicitudes/) });
  });

  test('asegurarPacienteActivo: paciente inexistente -> 404', async () => {
    await expect(asegurarPacienteActivo(pacienteRepo(true, false), 9, 'x')).rejects.toMatchObject({ status: 404 });
  });

  test('asegurarPacienteActivo: paciente activo -> devuelve el paciente', async () => {
    await expect(asegurarPacienteActivo(pacienteRepo(true), 3, 'x')).resolves.toMatchObject({ id: 3, activo: true });
  });

  test('crear solicitud para paciente desactivado -> 409 y no se guarda', async () => {
    const repo = { existeSolicitudActiva: jest.fn(async () => false), guardar: jest.fn() };
    const svc = new SolicitudService(repo, pacienteRepo(false), null);
    await expect(svc.crear({ idPaciente: 1, especialidad: 'cardiologia', motivo: 'control' }, 5))
      .rejects.toMatchObject({ status: 409 });
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  test('asignar cita a solicitud de paciente desactivado -> 409', async () => {
    const repo = {
      obtenerPorId: jest.fn(async () => ({ id: 1, idPaciente: 1, estado: 'pendiente_asignacion' })),
      asignarCita: jest.fn()
    };
    const svc = new SolicitudService(repo, pacienteRepo(false), null);
    await expect(svc.asignarCita(1, { fechaCita: '2099-12-01', horaCita: '10:00', idMedicoEspecialista: 3 }))
      .rejects.toMatchObject({ status: 409 });
    expect(repo.asignarCita).not.toHaveBeenCalled();
  });

  test('iniciar visita de paciente desactivado -> 409 y no se crea', async () => {
    const solicitudService = { obtener: jest.fn(async () => ({ id: 1, idPaciente: 1, estado: 'cita_asignada' })) };
    const repo = { obtenerPorSolicitud: jest.fn(async () => null), guardar: jest.fn() };
    const svc = new VisitaMedicaService(repo, solicitudService, pacienteRepo(false));
    await expect(svc.convertirDesdeSolicitud(1, 7)).rejects.toMatchObject({ status: 409 });
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  test('pedir examen en visita de paciente desactivado -> 409', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1, idMedicoEspecialista: 2, estado: 'en_atencion' });
    const repo = { obtenerPorId: jest.fn(async () => visita), agregarExamen: jest.fn() };
    const svc = new VisitaMedicaService(repo, {}, pacienteRepo(false));
    await expect(svc.agregarExamen(1, { tipo: 'Uroanalisis' })).rejects.toMatchObject({ status: 409 });
    expect(repo.agregarExamen).not.toHaveBeenCalled();
  });

  test('prescribir en visita de paciente desactivado -> 409', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1, idMedicoEspecialista: 2, estado: 'en_atencion' });
    const repo = { obtenerPorId: jest.fn(async () => visita), agregarPrescripcion: jest.fn() };
    const svc = new VisitaMedicaService(repo, {}, pacienteRepo(false));
    await expect(svc.agregarPrescripcion(1, { medicamento: 'Losartan', idMedicamento: 2 })).rejects.toMatchObject({ status: 409 });
    expect(repo.agregarPrescripcion).not.toHaveBeenCalled();
  });
});

describe('PacienteService — borrado logico', () => {
  const nuevo = (paciente, extra = {}) => {
    const repo = {
      obtenerPorId: jest.fn(async () => paciente),
      obtenerPorDpi: jest.fn(async () => extra.porDpi || null),
      obtenerTodos: jest.fn(async () => []),
      cambiarActivo: jest.fn(async (id, activo) => ({ ...paciente, id, activo }))
    };
    return { svc: new PacienteService(repo), repo };
  };

  test('desactivar paciente activo -> cambiarActivo(id, false) con el egreso', async () => {
    const { svc, repo } = nuevo({ id: 4, activo: true });
    const r = await svc.desactivar(4, { motivoEgreso: 'Traslado con su familia' });
    expect(repo.cambiarActivo).toHaveBeenCalledWith(4, false,
      { fechaEgreso: expect.any(Date), motivoEgreso: 'Traslado con su familia' });
    expect(r.activo).toBe(false);
  });

  test('reactivar paciente ya activo -> 409', async () => {
    const { svc, repo } = nuevo({ id: 4, activo: true });
    await expect(svc.reactivar(4)).rejects.toMatchObject({ status: 409 });
    expect(repo.cambiarActivo).not.toHaveBeenCalled();
  });

  test('reactivar paciente desactivado -> cambiarActivo(id, true)', async () => {
    const { svc, repo } = nuevo({ id: 4, activo: false });
    await svc.reactivar(4);
    expect(repo.cambiarActivo).toHaveBeenCalledWith(4, true);
  });

  test('listar pasa incluirInactivos al repositorio (por defecto false)', async () => {
    const { svc, repo } = nuevo(null);
    await svc.listar();
    await svc.listar({ incluirInactivos: true });
    expect(repo.obtenerTodos.mock.calls).toEqual([[{ incluirInactivos: false }], [{ incluirInactivos: true }]]);
  });

  test('registrar con DPI de un paciente desactivado -> mensaje que sugiere reactivarlo', async () => {
    const { svc } = nuevo(null, { porDpi: { id: 9, activo: false } });
    await expect(svc.registrar({
      nombres: 'A', apellidos: 'B', fechaNacimiento: '1940-01-01', genero: 'F', dpi: '1234567890123'
    })).rejects.toThrow(/desactivado.*reactivarlo/);
  });
});
