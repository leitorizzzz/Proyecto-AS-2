/**
 * Caso 15 del plan del SQA: al ordenar un examen queda registrado su costo
 * con el descuento de la fundacion (RN-09). Sin precio en el catalogo no
 * se ordena.
 */
process.env.DESCUENTO_FUNDACION = '0.20';
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedica = require('../src/models/VisitaMedica');

function servicio(precio) {
  const repo = {
    obtenerPorId: jest.fn(async () => new VisitaMedica({ id: 5, idPaciente: 2, estado: 'en_atencion' })),
    obtenerPrecioExamen: jest.fn(async () => precio),
    agregarExamen: jest.fn(async (_id, datos) => ({ id: 9, ...datos }))
  };
  const pacienteRepo = { obtenerPorId: jest.fn(async () => ({ id: 2, activo: true })) };
  return { repo, svc: new VisitaMedicaService(repo, {}, pacienteRepo) };
}

describe('Costo del examen al ordenarlo (caso 15, RN-09)', () => {
  test('la orden guarda precio base, descuento 20 % y costo', async () => {
    const { svc, repo } = servicio(85);
    const ex = await svc.agregarExamen(5, { tipo: ' Hematologia completa ' });
    expect(repo.obtenerPrecioExamen).toHaveBeenCalledWith('Hematologia completa');
    expect(ex).toMatchObject({ tipo: 'Hematologia completa', precioBase: 85, descuento: 17, costo: 68 });
  });

  test('redondeo a centavos', async () => {
    const { svc } = servicio(33.33);
    expect(await svc.agregarExamen(5, { tipo: 'X' })).toMatchObject({ descuento: 6.67, costo: 26.66 });
  });

  test('tipo sin precio en el catalogo -> 409 y no se registra la orden', async () => {
    const { svc, repo } = servicio(null);
    await expect(svc.agregarExamen(5, { tipo: 'Examen raro' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/no tiene precio configurado/) });
    expect(repo.agregarExamen).not.toHaveBeenCalled();
  });
});
