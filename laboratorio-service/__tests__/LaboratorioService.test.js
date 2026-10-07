/**
 * Pruebas unitarias de LaboratorioService.
 * Cubren RN-09 (20% descuento) y validaciones de registro de resultado.
 */
const LaboratorioService = require('../src/services/LaboratorioService');

function nuevoServicio({ orden, precio, existente } = {}) {
  const repo = {
    obtenerOrdenPorId: jest.fn(async () => orden || null),
    obtenerPrecioBase: jest.fn(async () => precio != null ? precio : null),
    obtenerResultadoPorExamen: jest.fn(async () => existente || null),
    guardar: jest.fn(async r => ({ ...r, id: 1 })),
    marcarOrdenComoDisponible: jest.fn(async () => {}),
    listarOrdenesPendientes: jest.fn(async () => [])
  };
  const pacRepo = { obtenerPorDpi: jest.fn(async () => null) };
  process.env.DESCUENTO_FUNDACION = '0.20';
  return { svc: new LaboratorioService(repo, pacRepo), repo, pacRepo };
}

describe('LaboratorioService', () => {

  test('RN-09: calcularCostoConDescuento aplica 20%', async () => {
    const { svc } = nuevoServicio({
      orden: { id: 1, tipo: 'Hematologia completa' },
      precio: 85
    });
    const r = await svc.calcularCostoConDescuento(1);
    expect(r.precioBase).toBe(85);
    expect(r.descuentoFundacion).toBe(17);  // 20% de 85
    expect(r.total).toBe(68);
  });

  test('calcularCostoConDescuento: tipo sin precio -> 404', async () => {
    const { svc } = nuevoServicio({ orden: { id: 1, tipo: 'desconocido' }, precio: null });
    await expect(svc.calcularCostoConDescuento(1)).rejects.toMatchObject({ status: 404 });
  });

  test('registrarResultado texto sin valorTexto -> 400', async () => {
    const { svc } = nuevoServicio({ orden: { id: 1, idVisita: 1 } });
    await expect(svc.registrarResultado(1, {
      tipoResultado: 'texto', valorTexto: ''
    })).rejects.toMatchObject({ status: 400 });
  });

  test('registrarResultado numerico sin valor -> 400', async () => {
    const { svc } = nuevoServicio({ orden: { id: 1, idVisita: 1 } });
    await expect(svc.registrarResultado(1, {
      tipoResultado: 'numerico', valorNumerico: null
    })).rejects.toMatchObject({ status: 400 });
  });

  test('registrarResultado tipo invalido -> 400', async () => {
    const { svc } = nuevoServicio({ orden: { id: 1, idVisita: 1 } });
    await expect(svc.registrarResultado(1, { tipoResultado: 'xyz' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('registrarResultado duplicado -> 409', async () => {
    const { svc } = nuevoServicio({
      orden: { id: 1, idVisita: 1 },
      existente: { id: 10 }
    });
    await expect(svc.registrarResultado(1, {
      tipoResultado: 'texto', valorTexto: 'normal'
    })).rejects.toMatchObject({ status: 409 });
  });

  test('registrarResultado OK marca orden como disponible', async () => {
    const { svc, repo } = nuevoServicio({ orden: { id: 1, idVisita: 1 } });
    const r = await svc.registrarResultado(1, {
      tipoResultado: 'texto', valorTexto: 'normal'
    });
    expect(r.estado).toBe('disponible');
    expect(repo.marcarOrdenComoDisponible).toHaveBeenCalledWith(1);
  });
});
