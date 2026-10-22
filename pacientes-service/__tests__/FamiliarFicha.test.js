/**
 * Casos 5 y 20 del plan del SQA: el alta del interno crea el familiar
 * responsable (datos completos) y la ficha medica 1:1; avisos internos
 * (caso 12) solo para su destinatario.
 */
const PacienteService = require('../src/services/PacienteService');
const AvisoService = require('../src/services/AvisoService');
const { camposInvalidosFamiliar } = require('../src/services/reglasFamiliar');

const PACIENTE = { nombres: 'Maria', apellidos: 'Lopez', fechaNacimiento: '1940-05-01', genero: 'F', dpi: '1234567890123' };
const FAMILIAR = { nombres: 'Ana', apellidos: 'Lopez', dpi: '9876543210123', parentesco: 'hija',
                   telefono: '5555 1234', email: 'ana@example.com', direccion: 'Zona 1, Mazatenango' };

function nuevo() {
  const repo = {
    obtenerPorDpi: jest.fn(async () => null),
    obtenerPorId: jest.fn(async id => ({ id, ...PACIENTE })),
    guardarConFamiliar: jest.fn(async p => ({ ...p, id: 50 })),
    obtenerFicha: jest.fn(async id => ({ id: 70, idPaciente: id })),
    actualizarFamiliarEmail: jest.fn(async () => {})
  };
  const familiarRepo = {
    obtenerPrincipal: jest.fn(async id => ({ id: 60, idPaciente: id, ...FAMILIAR })),
    guardarPrincipal: jest.fn(async () => ({}))
  };
  return { svc: new PacienteService(repo, familiarRepo), repo, familiarRepo };
}

describe('Alta de interno con familiar y ficha (caso 5)', () => {

  test('alta OK: transaccion con paciente + familiar; devuelve familiar y ficha', async () => {
    const { svc, repo } = nuevo();
    const r = await svc.registrar({ ...PACIENTE, familiar: FAMILIAR });
    const [paciente, familiar] = repo.guardarConFamiliar.mock.calls[0];
    expect(paciente.familiarEmail).toBe('ana@example.com');   // los avisos van al familiar
    expect(familiar).toMatchObject({ nombres: 'Ana', parentesco: 'hija' });
    expect(r).toMatchObject({ id: 50, familiar: { id: 60 }, ficha: { id: 70, idPaciente: 50 } });
  });

  test('alta sin familiar -> 400 y no se guarda nada', async () => {
    const { svc, repo } = nuevo();
    await expect(svc.registrar(PACIENTE)).rejects.toMatchObject({ status: 400, camposFaltantes: expect.arrayContaining(['nombres', 'telefono']) });
    expect(repo.guardarConFamiliar).not.toHaveBeenCalled();
  });

  test('familiar con DPI, correo o telefono invalidos -> 400 con los campos', async () => {
    const { svc } = nuevo();
    const err = await svc.registrar({ ...PACIENTE, familiar: { ...FAMILIAR, dpi: '123', email: 'no-es-correo', telefono: '12' } }).catch(e => e);
    expect(err.camposFaltantes).toEqual(['dpi (13 digitos)', 'email (formato)', 'telefono (8 a 20 digitos)']);
  });

  test('camposInvalidosFamiliar: completo -> [] ; vacio -> los 7 obligatorios', () => {
    expect(camposInvalidosFamiliar(FAMILIAR)).toEqual([]);
    expect(camposInvalidosFamiliar(null)).toHaveLength(7);
  });

  test('actualizarFamiliar exige datos completos y sincroniza el correo de avisos', async () => {
    const { svc, repo, familiarRepo } = nuevo();
    await expect(svc.actualizarFamiliar(50, { ...FAMILIAR, direccion: '' })).rejects.toMatchObject({ status: 400 });
    await svc.actualizarFamiliar(50, FAMILIAR);
    expect(familiarRepo.guardarPrincipal).toHaveBeenCalledWith(50, expect.objectContaining({ email: 'ana@example.com' }));
    expect(repo.actualizarFamiliarEmail).toHaveBeenCalledWith(50, 'ana@example.com');
  });
});

describe('Avisos internos (caso 12)', () => {

  test('listarMios filtra por el usuario del token', async () => {
    const repo = { listarPorUsuario: jest.fn(async () => []) };
    await new AvisoService(repo).listarMios('42', { soloNoLeidos: true });
    expect(repo.listarPorUsuario).toHaveBeenCalledWith(42, { soloNoLeidos: true });
  });

  test('editar el expediente no cambia el correo de avisos (sale del familiar)', async () => {
    const { svc, repo } = nuevo();
    repo.obtenerPorId.mockResolvedValueOnce({ id: 50, ...PACIENTE, familiarEmail: 'ana@example.com' });
    repo.actualizar = jest.fn(async (_id, p) => p);
    const r = await svc.actualizar(50, { ...PACIENTE, familiarEmail: 'otro@example.com' });
    expect(r.familiarEmail).toBe('ana@example.com');
  });

  test('marcar como leido un aviso ajeno -> 404', async () => {
    const repo = { marcarLeido: jest.fn(async () => null) };
    await expect(new AvisoService(repo).marcarLeido(5, 42)).rejects.toMatchObject({ status: 404 });
  });
});
