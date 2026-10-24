const { sql, getPool } = require('./database');
const TokenRecuperacion = require('../models/TokenRecuperacion');

/**
 * CAPA DE ACCESO A DATOS — tokens de recuperacion de contrasena.
 * Solo maneja hashes; nunca recibe ni guarda el token en claro.
 */
class TokenRecuperacionRepository {

  /** Guarda un token nuevo e invalida los anteriores sin usar del usuario. */
  async guardar(idUsuario, tokenHash, expira) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('idUsuario', sql.Int, idUsuario)
        .query(`UPDATE tokens_recuperacion SET usado = SYSUTCDATETIME()
                WHERE idUsuario = @idUsuario AND usado IS NULL`);
      const r = await new sql.Request(tx)
        .input('idUsuario', sql.Int, idUsuario)
        .input('tokenHash', sql.Char(64), tokenHash)
        .input('expira', sql.DateTime2, expira)
        .query(`INSERT INTO tokens_recuperacion (idUsuario, tokenHash, expira)
                OUTPUT INSERTED.* VALUES (@idUsuario, @tokenHash, @expira)`);
      await tx.commit();
      return new TokenRecuperacion(r.recordset[0]);
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }

  /** Token vigente (sin usar, sin vencer) de una cuenta activa, o null. */
  async obtenerVigente(tokenHash) {
    const pool = await getPool();
    const r = await pool.request()
      .input('tokenHash', sql.Char(64), tokenHash)
      .query(`SELECT t.* FROM tokens_recuperacion t
              INNER JOIN usuarios u ON u.id = t.idUsuario
              WHERE t.tokenHash = @tokenHash AND t.usado IS NULL
                AND t.expira > SYSUTCDATETIME() AND u.activo = 1`);
    return r.recordset[0] ? new TokenRecuperacion(r.recordset[0]) : null;
  }

  /**
   * Usa el token y cambia la contrasena en una transaccion. El UPDATE
   * condicional garantiza el "un solo uso" aunque lleguen dos peticiones a
   * la vez. Devuelve el idUsuario o null si el token ya no servia.
   */
  async consumir(tokenHash, passwordHash) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const r = await new sql.Request(tx)
        .input('tokenHash', sql.Char(64), tokenHash)
        .query(`UPDATE t SET usado = SYSUTCDATETIME()
                OUTPUT INSERTED.idUsuario
                FROM tokens_recuperacion t
                INNER JOIN usuarios u ON u.id = t.idUsuario
                WHERE t.tokenHash = @tokenHash AND t.usado IS NULL
                  AND t.expira > SYSUTCDATETIME() AND u.activo = 1`);
      const idUsuario = r.recordset[0]?.idUsuario;
      if (!idUsuario) { await tx.rollback(); return null; }
      await new sql.Request(tx)
        .input('id', sql.Int, idUsuario)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .query('UPDATE usuarios SET passwordHash = @passwordHash WHERE id = @id');
      // Cualquier otro enlace pendiente de la cuenta deja de servir.
      await new sql.Request(tx)
        .input('id', sql.Int, idUsuario)
        .query('UPDATE tokens_recuperacion SET usado = SYSUTCDATETIME() WHERE idUsuario = @id AND usado IS NULL');
      await tx.commit();
      return idUsuario;
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }
}

module.exports = TokenRecuperacionRepository;
