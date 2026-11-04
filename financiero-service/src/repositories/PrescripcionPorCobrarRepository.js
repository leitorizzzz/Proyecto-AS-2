const { sql, getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS — lectura de las prescripciones de visitas ya
 * cerradas que aun tienen unidades sin entregar (tablas compartidas
 * visita_prescripciones, visitas_medicas y medicamentos; duenos:
 * pacientes-service y farmacia-service).
 *
 * Caso 19 del SQA: la cuenta del familiar muestra lo que queda por cobrar
 * cuando farmacia despache; ese cargo se genera solo al despachar.
 */
class PrescripcionPorCobrarRepository {
  async pendientesDePaciente(idPaciente) {
    const pool = await getPool();
    const r = await pool.request().input('idPaciente', sql.Int, idPaciente).query(`
      SELECT p.id AS idPrescripcion, p.idVisita, p.medicamento, p.cantidadPrescrita,
             ISNULL(p.cantidadEntregada, 0) AS cantidadEntregada, p.idMedicamento,
             m.precioUnitario
      FROM visita_prescripciones p
      INNER JOIN visitas_medicas v ON v.id = p.idVisita
      LEFT JOIN medicamentos m ON m.id = p.idMedicamento
      WHERE v.idPaciente = @idPaciente
        AND v.estado = 'completada'
        AND p.cantidadPrescrita IS NOT NULL
        AND ISNULL(p.cantidadEntregada, 0) < p.cantidadPrescrita
      ORDER BY p.idVisita, p.id`);
    return r.recordset;
  }
}

module.exports = PrescripcionPorCobrarRepository;
