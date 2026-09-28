const { sql, getPool } = require('./database');

/**
 * Capa de acceso a datos de solo lectura sobre la tabla de pacientes
 * (propiedad de pacientes-service). Necesaria porque el laboratorio
 * identifica pacientes por DPI antes de registrar un resultado.
 * Al compartir la misma BD, es un SELECT directo.
 */
class PacienteReadRepository {
  async obtenerPorDpi(dpi) {
    const pool = await getPool();
    const result = await pool.request()
      .input('dpi', sql.NVarChar(20), dpi)
      .query(`
        SELECT id, nombres, apellidos, fechaNacimiento, dpi
        FROM pacientes WHERE dpi = @dpi
      `);
    return result.recordset[0] || null;
  }
}

module.exports = PacienteReadRepository;
