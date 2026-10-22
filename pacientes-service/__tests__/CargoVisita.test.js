/**
 * Caso 19 del plan del SQA: al cerrar la visita se genera un cargo
 * desglosado (consulta + laboratorio + farmacia) con el descuento de la
 * fundacion (RN-09). Aqui se prueba la regla de calculo; la atomicidad y
 * el bloqueo contra duplicados se prueban contra la BD real en el e2e.
 */
process.env.DESCUENTO_FUNDACION = '0.20';
const VisitaMedicaService = require('../src/services/VisitaMedicaService');
const VisitaMedica = require('../src/models/VisitaMedica');

const svc = new VisitaMedicaService({}, {}, {});
const visita = { id: 9, idPaciente: 4, idSolicitudReferencia: 3 };
const tarifa = { codigo: 'consulta_especialista', descripcion: 'Consulta con especialista', precioBase: 150 };
// Caso 20: el cargo exige familiar responsable con datos completos.
const familiar = { id: 33, nombres: 'Ana', apellidos: 'Gomez', dpi: '1234567890123', parentesco: 'hija',
                   telefono: '55551234', email: 'ana@example.com', direccion: 'Mazatenango' };

describe('Cargo automatico de la visita (caso 19, RN-09)', () => {

  test('consulta + 2 examenes + 1 dispensacion: desglose y total con descuento', () => {
    const cargo = svc.construirCargoVisita({
      visita, tarifa, familiar,
      examenes: [
        { id: 11, tipo: 'Hematologia completa', precioCatalogo: 85 },
        { id: 12, tipo: 'Uroanalisis', precioCatalogo: 60 }
      ],
      dispensaciones: [{ id: 21, cantidad: 2, medicamento: 'Losartan', costoTotal: 1.92 }]
    });
    expect(cargo.detalles.map(d => [d.rubro, d.montoBase, d.descuento, d.monto])).toEqual([
      ['consulta', 150, 30, 120],
      ['laboratorio', 85, 17, 68],
      ['laboratorio', 60, 12, 48],
      ['farmacia', 2.4, 0.48, 1.92]
    ]);
    expect(cargo.monto).toBe(237.92);
    expect(cargo.totalPorRubro('laboratorio')).toBe(116);
    expect(cargo).toMatchObject({ idPaciente: 4, idVisita: 9 });
  });

  test('visita solo con consulta: cargo = tarifa menos 20 %', () => {
    const cargo = svc.construirCargoVisita({ visita, tarifa, familiar });
    expect(cargo.monto).toBe(120);
    expect(cargo.detalles).toHaveLength(1);
  });

  test('el descuento siempre se aplica: ninguna linea cobra el precio base', () => {
    const cargo = svc.construirCargoVisita({
      visita, tarifa, familiar, examenes: [{ id: 1, tipo: 'EKG', precioCatalogo: 200 }]
    });
    for (const d of cargo.detalles) expect(d.monto).toBeLessThan(d.montoBase);
  });

  test('examen con costo registrado al ordenarlo: se usa ese costo, no el catalogo actual', () => {
    const cargo = svc.construirCargoVisita({
      visita, tarifa, familiar,
      examenes: [{ id: 1, tipo: 'EKG', precioCatalogo: 999, precioBase: 200, descuento: 40, costo: 160 }]
    });
    expect(cargo.detalles[1]).toMatchObject({ montoBase: 200, descuento: 40, monto: 160 });
  });

  test('sin tarifa de consulta -> 409 (no se cobra en cero en silencio)', () => {
    expect(() => svc.construirCargoVisita({ visita, tarifa: null, familiar }))
      .toThrow(expect.objectContaining({ status: 409 }));
  });

  test('examen sin precio configurado -> 409 y no se genera cargo', () => {
    expect(() => svc.construirCargoVisita({
      visita, tarifa, familiar, examenes: [{ id: 5, tipo: 'Examen raro', precioCatalogo: null }]
    })).toThrow(/no tiene precio configurado/);
  });

  test('el familiar responsable queda vinculado al cargo', () => {
    const cargo = svc.construirCargoVisita({ visita, tarifa, familiar });
    expect(cargo.idFamiliar).toBe(33);
  });

  test('sin familiar responsable -> 409 y no se genera cargo (caso 20)', () => {
    expect(() => svc.construirCargoVisita({ visita, tarifa, familiar: null }))
      .toThrow(expect.objectContaining({ status: 409, message: expect.stringMatching(/no tiene familiar responsable/) }));
  });

  test('familiar con datos incompletos -> 409 con los campos que faltan (caso 20)', () => {
    let err;
    try { svc.construirCargoVisita({ visita, tarifa, familiar: { ...familiar, telefono: '', direccion: null } }); }
    catch (e) { err = e; }
    expect(err).toMatchObject({ status: 409, camposFaltantes: ['telefono', 'direccion'] });
  });

  test('completar una visita ya completada -> 409 sin tocar el repositorio (no duplica el cargo)', async () => {
    const repo = {
      obtenerPorId: jest.fn(async () => new VisitaMedica({ id: 9, estado: 'completada', diagnostico: 'x', observaciones: 'y' })),
      completarConCargo: jest.fn()
    };
    await expect(new VisitaMedicaService(repo, {}, {}).completar(9)).rejects.toMatchObject({ status: 409 });
    expect(repo.completarConCargo).not.toHaveBeenCalled();
  });
});
