const { sql, getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS — lista de tokens revocados (cierre de sesion).
 *
 * Al cerrar sesion, auth-service guarda el jti del JWT con su vencimiento;
 * el middleware de autenticacion de los 7 servicios consulta esta tabla para
 * que un token copiado antes de salir ya no sirva. Las filas vencidas se
 * borran al revocar otro token (el JWT ya no serviria de todos modos).
 *
 * Este archivo se copia identico en los 7 servicios, como authMiddleware.
 */
const DDL = `
  IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tokens_revocados')
  CREATE TABLE tokens_revocados (
    jti NVARCHAR(64) NOT NULL PRIMARY KEY,
    vence DATETIME2 NOT NULL,
    fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );`;

class TokenRevocadoRepository {
  /** Idempotente; tolera la carrera si dos servicios la crean a la vez. */
  async crearTabla() {
    const pool = await getPool();
    try { await pool.request().query(DDL); } catch (e) { if (e.number !== 2714) throw e; }
  }

  async revocar(jti, vence) {
    const pool = await getPool();
    await pool.request()
      .input('jti', sql.NVarChar(64), jti)
      .input('vence', sql.DateTime2, vence)
      .query(`
        DELETE FROM tokens_revocados WHERE vence < SYSUTCDATETIME();
        IF NOT EXISTS (SELECT 1 FROM tokens_revocados WHERE jti = @jti)
          INSERT INTO tokens_revocados (jti, vence) VALUES (@jti, @vence);`);
  }

  async estaRevocado(jti) {
    const pool = await getPool();
    const r = await pool.request()
      .input('jti', sql.NVarChar(64), jti)
      .query('SELECT 1 AS si FROM tokens_revocados WHERE jti = @jti');
    return r.recordset.length > 0;
  }
}

module.exports = TokenRevocadoRepository;
