// Consultas de integridad sobre la BD compartida: cada una debe devolver 0 filas.
const { execFileSync } = require('child_process');
const sql = q => execFileSync('docker', ['exec', 'asilo-sqlserver', 'sh', '-c',
  '/opt/mssql-tools18/bin/sqlcmd -b -I -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d AsiloCabezaAlgodon -h -1 -W -s "|" -Q "SET NOCOUNT ON; $0"', q],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CHEQUEOS = {
  'cargo con desglose cuyo monto no es la suma del desglose':
    `SELECT cs.id, cs.monto, SUM(d.monto) FROM cargos_servicio cs JOIN cargos_detalle d ON d.idCargo = cs.id GROUP BY cs.id, cs.monto HAVING ABS(cs.monto - SUM(d.monto)) > 0.005`,
  'montoPagado distinto de la suma de abonos':
    `SELECT cs.id, cs.montoPagado, ISNULL(SUM(a.monto),0) FROM cargos_servicio cs LEFT JOIN abonos_cargo a ON a.idCargo = cs.id GROUP BY cs.id, cs.montoPagado HAVING ABS(cs.montoPagado - ISNULL(SUM(a.monto),0)) > 0.005`,
  'estado del cargo que no corresponde a su saldo':
    `SELECT id, monto, montoPagado, estado FROM cargos_servicio WHERE NOT ((montoPagado = 0 AND estado = 'pendiente') OR (montoPagado > 0 AND montoPagado < monto AND estado = 'parcial') OR (montoPagado = monto AND estado = 'pagado'))`,
  'detalle sin el 20 % de descuento (monto != base - descuento o descuento != 20 %)':
    `SELECT id, idCargo, rubro, montoBase, descuento, monto FROM cargos_detalle WHERE ABS(monto - (montoBase - descuento)) > 0.005 OR ABS(descuento - ROUND(montoBase * 0.20, 2)) > 0.011`,
  'examen con costo que no es base - 20 %':
    `SELECT id, tipo, precioBase, descuento, costo FROM visita_examenes WHERE precioBase IS NOT NULL AND (ABS(costo - (precioBase - descuento)) > 0.005 OR ABS(descuento - ROUND(precioBase * 0.20, 2)) > 0.011)`,
  'dispensación con costo distinto de cantidad x precio x 0.8':
    `SELECT d.id, d.cantidad, m.precioUnitario, d.costoTotal FROM dispensaciones d JOIN medicamentos m ON m.id = d.idMedicamento WHERE d.montoBase IS NOT NULL AND ABS(d.costoTotal - ROUND(d.montoBase * 0.8, 2)) > 0.011`,
  'stock negativo': `SELECT id, nombre, stock FROM medicamentos WHERE stock < 0`,
  'prescripción con más entregado que prescrito':
    `SELECT id, cantidadPrescrita, cantidadEntregada FROM visita_prescripciones WHERE cantidadEntregada > cantidadPrescrita`,
  'estado de prescripción que no corresponde a lo entregado':
    `SELECT id, cantidadPrescrita, cantidadEntregada, estado FROM visita_prescripciones WHERE cantidadPrescrita IS NOT NULL AND NOT ((ISNULL(cantidadEntregada,0) = 0 AND estado = 'pendiente') OR (cantidadEntregada > 0 AND cantidadEntregada < cantidadPrescrita AND estado = 'parcial') OR (cantidadEntregada = cantidadPrescrita AND estado = 'dispensada'))`,
  'costoFarmacia de la visita distinto de sus despachos':
    `SELECT v.id, v.costoFarmacia, ISNULL(SUM(d.costoTotal),0) FROM visitas_medicas v LEFT JOIN visita_prescripciones p ON p.idVisita = v.id LEFT JOIN dispensaciones d ON d.idPrescripcion = p.id GROUP BY v.id, v.costoFarmacia HAVING ABS(ISNULL(v.costoFarmacia,0) - ISNULL(SUM(d.costoTotal),0)) > 0.005`,
  'visita con más de un cargo de cierre':
    `SELECT idVisita, COUNT(*) FROM cargos_servicio WHERE origen = 'visita' GROUP BY idVisita HAVING COUNT(*) > 1`,
  'visita completada sin cargo':
    `SELECT v.id FROM visitas_medicas v WHERE v.estado = 'completada' AND NOT EXISTS (SELECT 1 FROM cargos_servicio c WHERE c.idVisita = v.id AND c.origen = 'visita')`,
  'visita completada con solicitud no completada':
    `SELECT v.id, s.estado FROM visitas_medicas v JOIN solicitudes_referencia s ON s.id = v.idSolicitudReferencia WHERE v.estado = 'completada' AND s.estado <> 'completada'`,
  'paciente activo sin familiar principal o sin ficha':
    `SELECT p.id FROM pacientes p WHERE p.activo = 1 AND p.apellidos NOT LIKE 'Sin familiar%' AND (NOT EXISTS (SELECT 1 FROM familiares f WHERE f.idPaciente = p.id AND f.principal = 1 AND f.activo = 1) OR NOT EXISTS (SELECT 1 FROM fichas_medicas fm WHERE fm.idPaciente = p.id))`,
  'dos solicitudes activas misma especialidad y paciente (RN-02)':
    `SELECT idPaciente, especialidad, COUNT(*) FROM solicitudes_referencia WHERE estado IN ('pendiente_asignacion','cita_asignada','en_atencion') GROUP BY idPaciente, especialidad HAVING COUNT(*) > 1`,
  'cuota pagada sin fecha de pago': `SELECT id FROM cuotas_mensuales WHERE estado = 'pagada' AND fechaPago IS NULL`,
  'cargo sin familiar titular': `SELECT id, idPaciente FROM cargos_servicio WHERE idFamiliar IS NULL`,
  'paciente egresado sin motivo o con motivo estando activo':
    `SELECT id, activo, motivoEgreso FROM pacientes WHERE (activo = 0 AND (motivoEgreso IS NULL OR fechaEgreso IS NULL)) OR (activo = 1 AND motivoEgreso IS NOT NULL)`
};
let mal = 0;
for (const [n, q] of Object.entries(CHEQUEOS)) {
  let out;
  try { out = sql(q); } catch (e) { out = `ERROR SQL: ${(e.stdout || e.message).split('\n')[1] || e.message}`; }
  // "Warning: Null value is eliminated..." es un aviso de SQL Server, no una fila.
  const filas = out ? out.split('\n').filter(l => l && !/^Warning:/.test(l)) : [];
  console.log(`${filas.length ? '✗' : '✓'} ${n}${filas.length ? `: ${filas.length} -> ${filas.slice(0, 5).join(' ; ')}` : ''}`);
  if (filas.length) mal++;
}
console.log(`\n${Object.keys(CHEQUEOS).length} chequeos, ${mal} con hallazgos`);
process.exitCode = mal ? 1 : 0;
