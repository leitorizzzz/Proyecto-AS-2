const { sql, getPool } = require('./database');
const RegistroAuditoria = require('../models/RegistroAuditoria');

/**
 * CAPA DE ACCESO A DATOS — solo lectura de la tabla compartida `auditoria`.
 * La escriben auth, pacientes, farmacia y financiero; reportes no la crea.
 */
class AuditoriaRepository {
  /**
   * @param desde  Date inclusiva
   * @param hasta  Date exclusiva
   */
  async listar({ desde, hasta, entidad, idEntidad, limite }) {
    const pool = await getPool();
    const req = pool.request().input('limite', sql.Int, limite);
    const condiciones = [];
    if (desde) { req.input('desde', sql.DateTime2, desde); condiciones.push('fecha >= @desde'); }
    if (hasta) { req.input('hasta', sql.DateTime2, hasta); condiciones.push('fecha < @hasta'); }
    if (entidad) { req.input('entidad', sql.NVarChar(50), entidad); condiciones.push('entidad = @entidad'); }
    if (idEntidad != null) { req.input('idEntidad', sql.Int, idEntidad); condiciones.push('idEntidad = @idEntidad'); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await req.query(`
      SELECT TOP (@limite) id, usuario, idUsuario, accion, entidad, idEntidad, detalle, fecha
      FROM auditoria ${where}
      ORDER BY fecha DESC, id DESC
    `);
    return r.recordset.map(f => new RegistroAuditoria(f));
  }
}

module.exports = AuditoriaRepository;
