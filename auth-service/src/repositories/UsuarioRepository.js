const { sql, getPool } = require('./database');
const Usuario = require('../models/Usuario');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "usuarios".
 */
class UsuarioRepository {

  async obtenerPorEmail(email) {
    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar(200), email)
      .query('SELECT * FROM usuarios WHERE email = @email');
    return result.recordset[0] ? new Usuario(result.recordset[0]) : null;
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM usuarios WHERE id = @id');
    return result.recordset[0] ? new Usuario(result.recordset[0]) : null;
  }

  async guardar(usuario) {
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar(200), usuario.nombre)
      .input('email', sql.NVarChar(200), usuario.email)
      .input('passwordHash', sql.NVarChar(255), usuario.passwordHash)
      .input('rol', sql.NVarChar(50), usuario.rol)
      .query(`
        INSERT INTO usuarios (nombre, email, passwordHash, rol)
        OUTPUT INSERTED.id
        VALUES (@nombre, @email, @passwordHash, @rol)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }
}

module.exports = UsuarioRepository;
