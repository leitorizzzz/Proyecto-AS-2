/**
 * Validaciones encontradas en la auditoria SQA (26 oct):
 *  - fecha de nacimiento futura o que no existe (2020-02-31 se corria al 2 de marzo);
 *  - cita en fecha pasada o con un medico que no es especialista;
 *  - prescripcion asociada a un medicamento que no existe o esta desactivado.
 */
const PacienteService = require('../src/services/PacienteService');
const SolicitudService = require('../src/services/SolicitudService');
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedica = require('../src/models/VisitaMedica');

const diaGt = n => new Date(Date.now() - 6 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

describe('Fecha de nacimiento', () => {
  const VALIDO = { nombres: 'María', apellidos: 'López', fechaNacimiento: '1940-05-01', genero: 'F', dpi: '1234567890123' };
  const svc = new PacienteService({ obtenerPorDpi: jest.fn(async () => null), guardar: jest.fn(async p => p) });
  test.each([['futura', diaGt(2)], ['inexistente 2020-02-31', '2020-02-31'], ['anterior a 1900', '1899-12-31'], ['texto', 'ayer']])
  ('%s -> 400', async (_n, fecha) => {
    await expect(svc.registrar({ ...VALIDO, fechaNacimiento: fecha })).rejects.toMatchObject({ status: 400 });
  });
  test('acepta un instante ISO (edición desde la pantalla) y la fecha de hoy', () => {
    expect(() => svc._validar({ ...VALIDO, fechaNacimiento: '1940-05-01T00:00:00.000Z' })).not.toThrow();
    expect(() => svc._validar({ ...VALIDO, fechaNacimiento: diaGt(0) })).not.toThrow();
  });
});

describe('Asignar cita', () => {
  function servicio(usuario) {
    const repo = {
      obtenerPorId: jest.fn(async () => ({ id: 5, idPaciente: 1, idMedicoGeneral: 2, idEnfermero: 8, especialidad: 'cardiologia', estado: 'pendiente_asignacion' })),
      asignarCitaConAvisos: jest.fn(async id => ({ id, estado: 'cita_asignada' }))
    };
    const pacienteRepo = { obtenerPorId: jest.fn(async () => ({ id: 1, nombres: 'X', apellidos: 'Y', activo: true })) };
    const usuarioRepo = { obtenerPorId: jest.fn(async () => usuario) };
    return { repo, svc: new SolicitudService(repo, pacienteRepo, null, usuarioRepo, {}) };
  }
  const ESP = { id: 7, nombre: 'Dr. E', rol: 'medico_especialista', activo: true };

  test.each([
    ['fecha de ayer', { fechaCita: diaGt(-1), horaCita: '10:00' }, ESP],
    ['fecha inexistente', { fechaCita: '2099-02-30', horaCita: '10:00' }, ESP],
    ['hora 25:00', { fechaCita: diaGt(5), horaCita: '25:00' }, ESP],
    ['médico que es enfermero', { fechaCita: diaGt(5), horaCita: '10:00' }, { id: 7, rol: 'enfermero', activo: true }],
    ['especialista desactivado', { fechaCita: diaGt(5), horaCita: '10:00' }, { ...ESP, activo: false }],
    ['médico inexistente', { fechaCita: diaGt(5), horaCita: '10:00' }, null]
  ])('%s -> 400 sin asignar', async (_n, datos, usuario) => {
    const { svc, repo } = servicio(usuario);
    await expect(svc.asignarCita(5, { ...datos, idMedicoEspecialista: 7 })).rejects.toMatchObject({ status: 400 });
    expect(repo.asignarCitaConAvisos).not.toHaveBeenCalled();
  });

  test('cita para hoy con especialista activo -> se asigna', async () => {
    const { svc, repo } = servicio(ESP);
    await svc.asignarCita(5, { fechaCita: diaGt(0), horaCita: '16:30', idMedicoEspecialista: 7 });
    expect(repo.asignarCitaConAvisos).toHaveBeenCalled();
  });
});

describe('Prescripción asociada al inventario', () => {
  function servicio(medicamento) {
    const repo = {
      obtenerPorId: jest.fn(async () => new VisitaMedica({ id: 5, idPaciente: 2, estado: 'en_atencion' })),
      obtenerMedicamento: jest.fn(async () => medicamento),
      agregarPrescripcion: jest.fn(async (_id, d) => ({ id: 1, ...d }))
    };
    const pacienteRepo = { obtenerPorId: jest.fn(async () => ({ id: 2, activo: true })) };
    return { repo, svc: new VisitaMedicaService(repo, {}, pacienteRepo) };
  }
  const RX = { medicamento: 'Amiodarona', cantidadPrescrita: 10 };

  test('medicamento inexistente -> 400', async () => {
    const { svc, repo } = servicio(null);
    await expect(svc.agregarPrescripcion(5, { ...RX, idMedicamento: 999999 })).rejects.toMatchObject({ status: 400 });
    expect(repo.agregarPrescripcion).not.toHaveBeenCalled();
  });
  test('medicamento desactivado -> 409', async () => {
    const { svc } = servicio({ id: 3, nombre: 'Amiodarona', activo: false });
    await expect(svc.agregarPrescripcion(5, { ...RX, idMedicamento: 3 })).rejects.toMatchObject({ status: 409 });
  });
  test('medicamento activo -> se guarda con su id', async () => {
    const { svc, repo } = servicio({ id: 3, nombre: 'Amiodarona', activo: true });
    await svc.agregarPrescripcion(5, { ...RX, idMedicamento: '3' });
    expect(repo.agregarPrescripcion.mock.calls[0][1]).toMatchObject({ idMedicamento: 3, cantidadPrescrita: 10 });
  });
  test('sin idMedicamento sigue permitida (registro informativo)', async () => {
    const { svc, repo } = servicio(null);
    await svc.agregarPrescripcion(5, RX);
    expect(repo.obtenerMedicamento).not.toHaveBeenCalled();
  });
});
