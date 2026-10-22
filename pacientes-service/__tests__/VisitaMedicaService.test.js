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

// Paciente activo por defecto; las pruebas de la regla "paciente activo"
// pasan activo: false.
function crearPacienteRepoMock(activo = true) {
  return { obtenerPorId: jest.fn(async id => ({ id, nombres: 'Rosa', apellidos: 'Gomez', activo })) };
}

function crearRepoMock(visita) {
  return {
    obtenerPorId: jest.fn(async () => visita),
    obtenerPorSolicitud: jest.fn(async () => null),
    guardar: jest.fn(async v => ({ ...v, id: 1 })),
    actualizarClinico: jest.fn(async (_id, d) => ({ ...visita, ...d })),
    marcarCompletada: jest.fn(async () => ({ ...visita, estado: VisitaMedica.ESTADOS.COMPLETADA })),
    agregarExamen: jest.fn(async () => ({ id: 1 })),
    agregarPrescripcion: jest.fn(async () => ({ id: 1 })),
    marcarIncompleta: jest.fn(async () => {}),
    // La transaccion real vive en el repositorio; aqui se ejecuta el
    // calculo del cargo con datos de ejemplo y se simula el cierre.
    completarConCargo: jest.fn(async (id, calcularCargo) => {
      const cargo = calcularCargo({
        visita,
        tarifa: { codigo: 'consulta_especialista', descripcion: 'Consulta', precioBase: 150 },
        examenes: [], dispensaciones: [],
        familiar: { id: 1, nombres: 'Ana', apellidos: 'G', dpi: '1234567890123', parentesco: 'hija',
                    telefono: '55551234', email: 'a@example.com', direccion: 'Mazatenango' }
      });
      cargo.id = 77;
      return { visita: { ...visita, estado: VisitaMedica.ESTADOS.COMPLETADA }, cargo };
    })
  };
}

describe('VisitaMedicaService', () => {

  test('completar sin diagnostico -> 400', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: '', observaciones: 'ok' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('en_atencion'), crearPacienteRepoMock());
    await expect(svc.completar(1)).rejects.toMatchObject({ status: 400 });
  });

  test('completar sin observaciones -> 400', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: 'HTA', observaciones: '' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('en_atencion'), crearPacienteRepoMock());
    await expect(svc.completar(1)).rejects.toMatchObject({ status: 400 });
  });

  test('completar OK con diagnostico y observaciones', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion',
      diagnostico: 'HTA', observaciones: 'Seguir' });
    const repo = crearRepoMock(visita);
    const svc = new VisitaMedicaService(repo, crearSolicitudServiceMock('en_atencion'), crearPacienteRepoMock());
    const r = await svc.completar(1);
    expect(r.estado).toBe(VisitaMedica.ESTADOS.COMPLETADA);
    // Cierre de visita + solicitud + cargo en una sola transaccion del repositorio.
    expect(repo.completarConCargo).toHaveBeenCalledWith(1, expect.any(Function));
    expect(repo.marcarCompletada).not.toHaveBeenCalled();
    expect(r.cargo).toMatchObject({ id: 77, monto: 120 });
  });

  test('inmutabilidad: editar visita completada -> 409', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'completada' });
    const svc = new VisitaMedicaService(crearRepoMock(visita), crearSolicitudServiceMock('completada'), crearPacienteRepoMock());
    await expect(svc.actualizarClinico(1, { diagnostico: 'x', observaciones: 'y' }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('agregar prescripcion con idMedicamento se envia al repo', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion' });
    const repo = crearRepoMock(visita);
    const svc = new VisitaMedicaService(repo, crearSolicitudServiceMock('en_atencion'), crearPacienteRepoMock());
    await svc.agregarPrescripcion(1, { medicamento: 'Losartan', idMedicamento: 2, dosis: '1/24h', cantidadPrescrita: 30 });
    expect(repo.agregarPrescripcion).toHaveBeenCalledWith(1, expect.objectContaining({
      medicamento: 'Losartan', idMedicamento: 2, cantidadPrescrita: 30
    }));
  });

  test('prescripcion sin cantidadPrescrita (o no entera) -> 400', async () => {
    const visita = new VisitaMedica({ id: 1, idSolicitudReferencia: 1, idPaciente: 1,
      idMedicoEspecialista: 2, estado: 'en_atencion' });
    const repo = crearRepoMock(visita);
    const svc = new VisitaMedicaService(repo, crearSolicitudServiceMock('en_atencion'), crearPacienteRepoMock());
    await expect(svc.agregarPrescripcion(1, { medicamento: 'Losartan', idMedicamento: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.agregarPrescripcion(1, { medicamento: 'Losartan', cantidadPrescrita: 2.5 })).rejects.toMatchObject({ status: 400 });
    expect(repo.agregarPrescripcion).not.toHaveBeenCalled();
  });
});
