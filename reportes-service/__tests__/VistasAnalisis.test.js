/**
 * Vistas de solo lectura con los nombres del Analisis (el SQA inspecciona
 * la base con esos nombres). Se verifica el SQL que se envia: los 7
 * nombres, CREATE OR ALTER (idempotente), columnas clave y que el log de
 * notificaciones no exponga el cuerpo del correo (el de recuperacion de
 * contrasena lleva el enlace).
 */
const mockBatches = [];
jest.mock('../src/repositories/database', () => ({
  getPool: async () => ({ request: () => ({ batch: async sql => { mockBatches.push(sql); } }) })
}));
const VistasAnalisisRepository = require('../src/repositories/VistasAnalisisRepository');

describe('Vistas del Análisis', () => {
  let resultado;
  beforeAll(async () => { resultado = await new VistasAnalisisRepository().crearTodas(); });

  test('las 7 vistas con los nombres exactos del Análisis, idempotentes', () => {
    expect(VistasAnalisisRepository.nombres).toEqual(['internos', 'familiares_responsables', 'examenes_laboratorio',
      'despachos_farmacia', 'cargos_servicios_medicos', 'log_notificaciones', 'log_auditoria']);
    expect(resultado.creadas).toHaveLength(7);
    mockBatches.forEach(sql => expect(sql).toMatch(/^CREATE OR ALTER VIEW dbo\.\w+ AS /));
  });

  test('columnas equivalentes que pide el plan', () => {
    const sql = n => mockBatches.find(b => b.includes(`dbo.${n} `));
    expect(sql('examenes_laboratorio')).toMatch(/costo_con_descuento/);
    expect(sql('examenes_laboratorio')).toMatch(/precio_base/);
    expect(sql('cargos_servicios_medicos')).toMatch(/tipo_cargo/);
    expect(sql('cargos_servicios_medicos')).toMatch(/estado_cobro/);
    expect(sql('log_notificaciones')).toMatch(/estado_envio/);
    expect(sql('log_notificaciones')).toMatch(/'enviado'/);
    expect(sql('log_notificaciones')).toMatch(/'error'/);
    expect(sql('log_auditoria')).toMatch(/datos_anteriores/);
    expect(sql('log_auditoria')).toMatch(/datos_nuevos/);
    expect(sql('internos')).toMatch(/'inactivo'/);
  });

  test('log_notificaciones no expone el cuerpo del correo', () => {
    const sql = mockBatches.find(b => b.includes('dbo.log_notificaciones '));
    expect(sql).not.toMatch(/cuerpo/i);
  });
});
