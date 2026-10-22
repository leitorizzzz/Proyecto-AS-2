const { sql, getPool } = require('./database');
const Aviso = require('../models/Aviso');

/** CAPA DE ACCESO A DATOS — notificaciones internas (tabla avisos). */
class AvisoRepository {

  async listarPorUsuario(idUsuario, { soloNoLeidos = false } = {}) {
    const pool = await getPool();
    const r = await pool.request().input('idUsuario', sql.Int, idUsuario).query(`
      SELECT TOP 50 * FROM avisos
      WHERE idUsuario = @idUsuario ${soloNoLeidos ? 'AND leido = 0' : ''}
      ORDER BY fecha DESC, id DESC
    `);
    return r.recordset.map(a => new Aviso(a));
  }

  /** Solo el destinatario puede marcarlo: si no es suyo, no cambia nada. */
  async marcarLeido(id, idUsuario) {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).input('idUsuario', sql.Int, idUsuario).query(`
      UPDATE avisos SET leido = 1 OUTPUT INSERTED.* WHERE id = @id AND idUsuario = @idUsuario
    `);
    return r.recordset[0] ? new Aviso(r.recordset[0]) : null;
  }

  /** Inserta avisos dentro de una transaccion existente. */
  async insertarEn(tx, avisos) {
    for (const a of avisos) {
      await new sql.Request(tx)
        .input('idUsuario', sql.Int, a.idUsuario)
        .input('tipo', sql.NVarChar(30), a.tipo)
        .input('mensaje', sql.NVarChar(500), a.mensaje)
        .input('idSolicitud', sql.Int, a.idSolicitud ?? null)
        .query(`INSERT INTO avisos (idUsuario, tipo, mensaje, idSolicitud)
                VALUES (@idUsuario, @tipo, @mensaje, @idSolicitud)`);
    }
  }
}

module.exports = AvisoRepository;
