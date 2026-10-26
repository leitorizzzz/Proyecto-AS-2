/**
 * Validacion de montos, anios, fechas y correos del modulo financiero
 * (auditoria SQA, 26 oct). Antes un monto "cien" o 1e15 llegaba a la BD y
 * respondia 500 con el mensaje de SQL; una cuota del anio 1900 o con
 * vencimiento 2026-02-30 se guardaba; un donante con correo "malo" tambien;
 * y el estado de cuenta de un paciente inexistente respondia 200 vacio.
 */
const FinancieroService = require('../src/services/FinancieroService');
const V = require('../src/services/reglasValores');

function nuevoServicio({ existePaciente = true } = {}) {
  const cuentaRepo = {
    listarCargosPorPaciente: jest.fn(async () => []), cuotasPorPaciente: jest.fn(async () => []),
    saldoPendientePorPaciente: jest.fn(async () => 0), saldoCuotasPendientes: jest.fn(async () => 0),
    guardarCargo: jest.fn(async c => ({ ...c, id: 1 })), obtenerCuota: jest.fn(async () => null),
    guardarCuota: jest.fn(async c => ({ ...c, id: 1 })), obtenerCargo: jest.fn(async () => null)
  };
  const donRepo = { guardarDonante: jest.fn(async d => ({ ...d, id: 1 })), obtenerDonante: jest.fn(async () => ({ id: 1, activo: true })), guardarDonacion: jest.fn(async d => d) };
  const movRepo = { guardarGasto: jest.fn(async g => g), guardarPagoFundacion: jest.fn(async p => p) };
  const familiarRepo = {
    obtenerPrincipal: jest.fn(async () => ({ id: 3, nombres: 'Ana', apellidos: 'G', dpi: '1234567890123', parentesco: 'hija', telefono: '5555', email: 'a@example.com', direccion: 'Zona 1' })),
    existePaciente: jest.fn(async () => existePaciente)
  };
  return { svc: new FinancieroService(cuentaRepo, donRepo, movRepo, familiarRepo), cuentaRepo, donRepo, movRepo };
}

describe('reglasValores.montoValido', () => {
  test.each([['texto', 'cien'], ['cero', 0], ['negativo', -5], ['NaN', NaN], ['enorme', 1e15], ['3 decimales', 10.555], ['null', null], ['vacío', ''], ['booleano', true]])
  ('%s -> 400', (_n, v) => { expect(() => V.montoValido(v)).toThrow(expect.objectContaining({ status: 400 })); });
  test('acepta 0.01, 150 y "99.5"', () => {
    expect(V.montoValido(0.01)).toBe(0.01); expect(V.montoValido(150)).toBe(150); expect(V.montoValido('99.5')).toBe(99.5);
  });
});

describe('FinancieroService: entradas inválidas -> 400 sin tocar la BD', () => {
  test.each([
    ['cargo monto texto', s => s.generarCargo({ idPaciente: 1, concepto: 'x', monto: 'cien' })],
    ['cargo monto enorme', s => s.generarCargo({ idPaciente: 1, concepto: 'x', monto: 1e15 })],
    ['cargo concepto en blanco', s => s.generarCargo({ idPaciente: 1, concepto: '   ', monto: 10 })],
    ['cargo concepto de 301', s => s.generarCargo({ idPaciente: 1, concepto: 'x'.repeat(301), monto: 10 })],
    ['cuota año 1900', s => s.emitirCuota({ idPaciente: 1, mes: 1, anio: 1900, monto: 10 })],
    ['cuota vencimiento 2026-02-30', s => s.emitirCuota({ idPaciente: 1, mes: 3, anio: 2026, monto: 10, fechaVencimiento: '2026-02-30' })],
    ['cuota monto texto', s => s.emitirCuota({ idPaciente: 1, mes: 3, anio: 2026, monto: 'diez' })],
    ['pago de cuota año 3000', s => s.registrarPagoCuota({ idPaciente: 1, mes: 1, anio: 3000, monto: 10 })],
    ['donante correo inválido', s => s.registrarDonante({ nombre: 'Ana', email: 'malo' })],
    ['donante teléfono con letras', s => s.registrarDonante({ nombre: 'Ana', telefono: 'llamar luego' })],
    ['donación monto texto', s => s.registrarDonacion({ idDonante: 1, monto: 'mucho' })],
    ['gasto monto texto', s => s.registrarGasto({ concepto: 'Luz', monto: 'x' })],
    ['pago fundación concepto en blanco', s => s.registrarPagoFundacion({ concepto: ' ', monto: 5 })],
    ['estado de cuenta id texto', s => s.estadoCuenta('abc')]
  ])('%s', async (_n, fn) => {
    const { svc, cuentaRepo, movRepo, donRepo } = nuevoServicio();
    await expect(fn(svc)).rejects.toMatchObject({ status: 400 });
    expect(cuentaRepo.guardarCargo).not.toHaveBeenCalled();
    expect(cuentaRepo.guardarCuota).not.toHaveBeenCalled();
    expect(movRepo.guardarGasto).not.toHaveBeenCalled();
    expect(donRepo.guardarDonante).not.toHaveBeenCalled();
  });

  test('estado de cuenta de un paciente inexistente -> 404', async () => {
    const { svc } = nuevoServicio({ existePaciente: false });
    await expect(svc.estadoCuenta(999999)).rejects.toMatchObject({ status: 404 });
  });

  test('donante válido: correo y teléfono limpios, tildes intactas', async () => {
    const { svc, donRepo } = nuevoServicio();
    await svc.registrarDonante({ nombre: '  Fundación Güemes ', email: ' ayuda@fundacion.org ', telefono: '+502 5555-1234' });
    expect(donRepo.guardarDonante.mock.calls[0][0]).toMatchObject({ nombre: 'Fundación Güemes', email: 'ayuda@fundacion.org', telefono: '+502 5555-1234' });
  });

  test('cargo válido guarda el concepto sin espacios de más', async () => {
    const { svc, cuentaRepo } = nuevoServicio();
    await svc.generarCargo({ idPaciente: 1, concepto: '  Consulta  ', monto: '150.50' });
    expect(cuentaRepo.guardarCargo.mock.calls[0][0]).toMatchObject({ concepto: 'Consulta', monto: 150.5 });
  });
});
