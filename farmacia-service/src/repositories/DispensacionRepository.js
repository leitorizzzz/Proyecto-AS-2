const { sql, getPool } = require('./database');
const Dispensacion = require('../models/Dispensacion');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "dispensaciones".
 */
class DispensacionRepository {

  async guardar(dispensacion) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, dispensacion.idPaciente)
      .input('idVisita', sql.Int, dispensacion.idVisita)
      .input('idMedicamento', sql.Int, dispensacion.idMedicamento)
      .input('cantidad', sql.Int, dispensacion.cantidad)
      .input('costoTotal', sql.Decimal(10, 2), dispensacion.costoTotal)
      .input('fecha', sql.DateTime2, new Date(dispensacion.fecha))
      .query(`
        INSERT INTO dispensaciones
          (idPaciente, idVisita, idMedicamento, cantidad, costoTotal, fecha)
        OUTPUT INSERTED.id
        VALUES (@idPaciente, @idVisita, @idMedicamento, @cantidad, @costoTotal, @fecha)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dispensaciones WHERE id = @id');
    return result.recordset[0] ? new Dispensacion(result.recordset[0]) : null;
  }

  async obtenerPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM dispensaciones WHERE idPaciente = @idPaciente ORDER BY fecha DESC');
    return result.recordset.map(f => new Dispensacion(f));
  }
}

module.exports = DispensacionRepository;
