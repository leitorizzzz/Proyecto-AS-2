const { sql, getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS — lectura del familiar responsable principal en la
 * tabla compartida familiares (dueno: pacientes-service). Es el titular de
 * la cuenta del paciente.
 */
class FamiliarReadRepository {
  async obtenerPrincipal(idPaciente) {
    const pool = await getPool();
    const r = await pool.request().input('idPaciente', sql.Int, idPaciente).query(`
      SELECT id, idPaciente, nombres, apellidos, dpi, parentesco, telefono, email, direccion
      FROM familiares WHERE idPaciente = @idPaciente AND principal = 1 AND activo = 1
    `);
    return r.recordset[0] || null;
  }
}

module.exports = FamiliarReadRepository;
