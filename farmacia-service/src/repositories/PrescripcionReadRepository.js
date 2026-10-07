const { sql, getPool } = require('./database');
const Prescripcion = require('../models/Prescripcion');

/**
 * CAPA DE ACCESO A DATOS
 *
 * Lee y marca prescripciones en la tabla compartida visita_prescripciones
 * (propiedad de pacientes-service, misma BD AsiloCabezaAlgodon). Patron
 * identico al que ya usa laboratorio-service con visita_examenes.
 *
 * Expone solo las operaciones que farmacia necesita:
 *   - listar pendientes por paciente
 *   - obtener una por id
 *   - marcar una como dispensada vinculandola a una dispensacion
 */
class PrescripcionReadRepository {

  async listarPendientesPorPaciente(idPaciente) {
    const pool = await getPool();
    const r = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query(`
        SELECT
          vp.id,
          vp.idVisita,
          vm.idPaciente,
          vp.idMedicamento,
          vp.medicamento,
          vp.dosis,
          vp.indicaciones,
          vp.estado,
          vp.idDispensacion,
          vp.fechaPrescripcion,
          vp.fechaDispensacion
        FROM visita_prescripciones vp
        INNER JOIN visitas_medicas vm ON vm.id = vp.idVisita
        WHERE vm.idPaciente = @idPaciente
          AND vp.estado = 'pendiente'
        ORDER BY vp.fechaPrescripcion DESC
      `);
    return r.recordset.map(f => new Prescripcion(f));
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          vp.id,
          vp.idVisita,
          vm.idPaciente,
          vp.idMedicamento,
          vp.medicamento,
          vp.dosis,
          vp.indicaciones,
          vp.estado,
          vp.idDispensacion,
          vp.fechaPrescripcion,
          vp.fechaDispensacion
        FROM visita_prescripciones vp
        INNER JOIN visitas_medicas vm ON vm.id = vp.idVisita
        WHERE vp.id = @id
      `);
    return r.recordset[0] ? new Prescripcion(r.recordset[0]) : null;
  }

  async marcarDispensada(idPrescripcion, idDispensacion) {
    const pool = await getPool();
    await pool.request()
      .input('idPrescripcion', sql.Int, idPrescripcion)
      .input('idDispensacion', sql.Int, idDispensacion)
      .query(`
        UPDATE visita_prescripciones
        SET estado = 'dispensada',
            idDispensacion = @idDispensacion,
            fechaDispensacion = SYSUTCDATETIME()
        WHERE id = @idPrescripcion
          AND estado = 'pendiente'
      `);
  }
}

module.exports = PrescripcionReadRepository;
