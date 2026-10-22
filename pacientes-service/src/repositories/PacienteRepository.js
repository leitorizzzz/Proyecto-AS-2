const { sql, getPool } = require('./database');
const Paciente = require('../models/Paciente');
const FichaMedica = require('../models/FichaMedica');
const FamiliarRepository = require('./FamiliarRepository');

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

  /**
   * Alta del interno (caso 5) en UNA transaccion: paciente + familiar
   * responsable principal + ficha medica 1:1. Si algo falla, no queda nada.
   */
  async guardarConFamiliar(paciente, familiar) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const id = (await this._bind(new sql.Request(tx), paciente).query(`
        INSERT INTO pacientes
          (nombres, apellidos, fechaNacimiento, genero, dpi,
           direccion, telefono, contactoEmergencia, familiarEmail, padecimientos)
        OUTPUT INSERTED.id
        VALUES
          (@nombres, @apellidos, @fechaNacimiento, @genero, @dpi,
           @direccion, @telefono, @contactoEmergencia, @familiarEmail, @padecimientos)
      `)).recordset[0].id;
      await new FamiliarRepository().guardarPrincipal(id, familiar, tx);
      await new sql.Request(tx)
        .input('idPaciente', sql.Int, id)
        .input('antecedentes', sql.NVarChar(sql.MAX), paciente.padecimientos || null)
        .query('INSERT INTO fichas_medicas (idPaciente, antecedentes) VALUES (@idPaciente, @antecedentes)');
      await tx.commit();
      return this.obtenerPorId(id);
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }

  async actualizarFamiliarEmail(id, email) {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).input('email', sql.NVarChar(200), email)
      .query('UPDATE pacientes SET familiarEmail = @email WHERE id = @id');
  }

  async obtenerFicha(idPaciente) {
    const pool = await getPool();
    const r = await pool.request().input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM fichas_medicas WHERE idPaciente = @idPaciente');
    return r.recordset[0] ? new FichaMedica(r.recordset[0]) : null;
  }

  /**
   * Devuelve la ficha del paciente y la crea si no existe (pacientes dados de
   * alta antes de que hubiera fichas). El UNIQUE garantiza que sea 1:1
   * aunque dos peticiones lleguen a la vez.
   */
  async asegurarFicha(idPaciente) {
    const existente = await this.obtenerFicha(idPaciente);
    if (existente) return existente;
    const pool = await getPool();
    try {
      await pool.request().input('idPaciente', sql.Int, idPaciente).query(`
        INSERT INTO fichas_medicas (idPaciente, antecedentes)
        SELECT id, padecimientos FROM pacientes WHERE id = @idPaciente
      `);
    } catch (err) {
      if (err.number !== 2627 && err.number !== 2601) throw err;
    }
    return this.obtenerFicha(idPaciente);
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
