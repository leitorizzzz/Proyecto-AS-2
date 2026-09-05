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
      .input('padecimientos', sql.NVarChar(sql.MAX), p.padecimientos);
  }

  async obtenerTodos() {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT * FROM pacientes ORDER BY apellidos, nombres');
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
           direccion, telefono, contactoEmergencia, padecimientos)
        OUTPUT INSERTED.id
        VALUES
          (@nombres, @apellidos, @fechaNacimiento, @genero, @dpi,
           @direccion, @telefono, @contactoEmergencia, @padecimientos)
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
          padecimientos = @padecimientos
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  async eliminar(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pacientes WHERE id = @id');
    return result.rowsAffected[0] > 0;
  }
}

module.exports = PacienteRepository;
