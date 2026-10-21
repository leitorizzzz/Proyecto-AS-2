const { sql, getPool } = require('./database');
const Paciente = require('../models/Paciente');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "pacientes".
 */
class PacienteRepository {

  _bind(request, p) {
    return request
      .input('nombres', sql.NVarChar(200), p.nombres)
      .input('apellidos', sql.NVarChar(200), p.apellidos)
      .input('fechaNacimiento', sql.Date, new Date(p.fechaNacimiento))
      .input('genero', sql.NVarChar(20), p.genero)
      .input('dpi', sql.NVarChar(20), p.dpi)
      .input('direccion', sql.NVarChar(300), p.direccion)
      .input('telefono', sql.NVarChar(30), p.telefono)
      .input('contactoEmergencia', sql.NVarChar(200), p.contactoEmergencia)
      .input('familiarEmail', sql.NVarChar(200), p.familiarEmail)
      .input('padecimientos', sql.NVarChar(sql.MAX), p.padecimientos);
  }

  /** Por defecto solo activos; incluirInactivos los trae todos. */
  async obtenerTodos({ incluirInactivos = false } = {}) {
    const pool = await getPool();
    const where = incluirInactivos ? '' : 'WHERE activo = 1';
    const result = await pool.request()
      .query(`SELECT * FROM pacientes ${where} ORDER BY apellidos, nombres`);
    return result.recordset.map(f => new Paciente(f));
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM pacientes WHERE id = @id');
    return result.recordset[0] ? new Paciente(result.recordset[0]) : null;
  }

  async obtenerPorDpi(dpi) {
    const pool = await getPool();
    const result = await pool.request()
      .input('dpi', sql.NVarChar(20), dpi)
      .query('SELECT * FROM pacientes WHERE dpi = @dpi');
    return result.recordset[0] ? new Paciente(result.recordset[0]) : null;
  }

  async guardar(paciente) {
    const pool = await getPool();
    const result = await this._bind(pool.request(), paciente)
      .query(`
        INSERT INTO pacientes
          (nombres, apellidos, fechaNacimiento, genero, dpi,
           direccion, telefono, contactoEmergencia, familiarEmail, padecimientos)
        OUTPUT INSERTED.id
        VALUES
          (@nombres, @apellidos, @fechaNacimiento, @genero, @dpi,
           @direccion, @telefono, @contactoEmergencia, @familiarEmail, @padecimientos)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async actualizar(id, paciente) {
    const pool = await getPool();
    await this._bind(pool.request(), paciente)
      .input('id', sql.Int, id)
      .query(`
        UPDATE pacientes SET
          nombres = @nombres,
          apellidos = @apellidos,
          fechaNacimiento = @fechaNacimiento,
          genero = @genero,
          dpi = @dpi,
          direccion = @direccion,
          telefono = @telefono,
          contactoEmergencia = @contactoEmergencia,
          familiarEmail = @familiarEmail,
          padecimientos = @padecimientos
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  /** Borrado logico: no hay DELETE fisico de pacientes. */
  async cambiarActivo(id, activo) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo ? 1 : 0)
      .query('UPDATE pacientes SET activo = @activo WHERE id = @id');
    return this.obtenerPorId(id);
  }
}

module.exports = PacienteRepository;
