const { sql, getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS — lectura de la tabla compartida usuarios (dueno:
 * auth-service). Solo para validar a quien se asigna algo (p. ej. el
 * enfermero de una solicitud). Nunca lee passwordHash.
 */
class UsuarioReadRepository {
  async obtenerPorId(id) {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id)
      .query('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = @id');
    const u = r.recordset[0];
    return u ? { ...u, activo: u.activo === undefined ? true : Boolean(u.activo) } : null;
  }
}

module.exports = UsuarioReadRepository;
