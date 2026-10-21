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

  /**
   * Lista usuarios, opcionalmente filtrados por uno o varios roles.
   * Por defecto solo cuentas activas.
   */
  async listar({ roles = [], incluirInactivos = false } = {}) {
    const pool = await getPool();
    const request = pool.request();
    const condiciones = [];
    if (roles.length) {
      const params = roles.map((rol, i) => {
        request.input(`rol${i}`, sql.NVarChar(50), rol);
        return `@rol${i}`;
      });
      condiciones.push(`rol IN (${params.join(', ')})`);
    }
    if (!incluirInactivos) condiciones.push('activo = 1');
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const result = await request.query(`SELECT * FROM usuarios ${where} ORDER BY nombre`);
    return result.recordset.map(r => new Usuario(r));
  }

  async cambiarActivo(id, activo) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo ? 1 : 0)
      .query('UPDATE usuarios SET activo = @activo WHERE id = @id');
    return this.obtenerPorId(id);
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
