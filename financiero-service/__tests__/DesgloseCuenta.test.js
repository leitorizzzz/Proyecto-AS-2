/**
 * Caso 19 del SQA ("no se realizo el cargo automaticamente del
 * medicamento"): la cuenta del familiar muestra el total cobrado por rubro
 * y lo que queda por cobrar cuando farmacia despache lo prescrito.
 */
process.env.DESCUENTO_FUNDACION = '0.20';
const FinancieroService = require('../src/services/FinancieroService');

function servicio({ cargos = [], pendientes = [] } = {}) {
  const cuentaRepo = {
    listarCargosPorPaciente: jest.fn(async () => cargos), cuotasPorPaciente: jest.fn(async () => []),
    saldoPendientePorPaciente: jest.fn(async () => 0), saldoCuotasPendientes: jest.fn(async () => 0)
  };
  const familiarRepo = { obtenerPrincipal: jest.fn(async () => null), existePaciente: jest.fn(async () => true) };
  const prescripcionRepo = { pendientesDePaciente: jest.fn(async () => pendientes) };
  return new FinancieroService(cuentaRepo, {}, {}, familiarRepo, prescripcionRepo);
}

describe('Desglose de la cuenta y farmacia por cobrar (caso 19)', () => {
  test('suma por rubro el cargo de la visita, el complementario de farmacia y uno manual', async () => {
    const r = await servicio({ cargos: [
      { id: 1, monto: 144, detalles: [{ rubro: 'consulta', monto: 120 }, { rubro: 'farmacia', monto: 24 }] },
      { id: 2, monto: 14.4, detalles: [{ rubro: 'farmacia', monto: 14.4 }] },
      { id: 3, monto: 50, detalles: [] }
    ] }).estadoCuenta(7);
    expect(r.desglose).toEqual({ consulta: 120, laboratorio: 0, farmacia: 38.4, otros: 50 });
  });

  test('lo prescrito sin entregar en visitas cerradas se informa con su costo estimado', async () => {
    const r = await servicio({ pendientes: [
      { idPrescripcion: 9, idVisita: 4, medicamento: 'Metformina', cantidadPrescrita: 10, cantidadEntregada: 4, idMedicamento: 2, precioUnitario: 3 },
      { idPrescripcion: 10, idVisita: 4, medicamento: 'Vitamina D', cantidadPrescrita: 5, cantidadEntregada: 0, idMedicamento: null, precioUnitario: null }
    ] }).estadoCuenta(7);
    expect(r.porCobrarFarmacia[0]).toMatchObject({ cantidadRestante: 6, montoBase: 18, montoEstimado: 14.4, sinInventario: false });
    expect(r.porCobrarFarmacia[1]).toMatchObject({ cantidadRestante: 5, montoEstimado: null, sinInventario: true });
    expect(r.totalPorCobrar).toBe(14.4);
  });
});
