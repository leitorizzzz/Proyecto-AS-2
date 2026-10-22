const { sql, getPool } = require('./database');
const Familiar = require('../models/Familiar');

/**
 * CAPA DE ACCESO A DATOS — familiares responsables (tabla familiares).
 * Acepta una transaccion opcional para usarse dentro del alta del paciente.
 */
class FamiliarRepository {

  async obtenerPrincipal(idPaciente, tx = null) {
    const rq = tx ? new sql.Request(tx) : (await getPool()).request();
    const r = await rq.input('idPaciente', sql.Int, idPaciente).query(`
      SELECT * FROM familiares WHERE idPaciente = @idPaciente AND principal = 1 AND activo = 1
    `);
    return r.recordset[0] ? new Familiar(r.recordset[0]) : null;
  }

  async principalesDe(idsPaciente) {
    if (!idsPaciente.length) return [];
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT * FROM familiares WHERE principal = 1 AND activo = 1
        AND idPaciente IN (${idsPaciente.map(Number).filter(Number.isInteger).join(',') || 'NULL'})
    `);
    return r.recordset.map(f => new Familiar(f));
  }

  _bind(rq, f) {
    return rq
      .input('nombres', sql.NVarChar(200), f.nombres)
      .input('apellidos', sql.NVarChar(200), f.apellidos)
      .input('dpi', sql.NVarChar(13), f.dpi)
      .input('parentesco', sql.NVarChar(50), f.parentesco)
      .input('telefono', sql.NVarChar(30), f.telefono)
      .input('email', sql.NVarChar(200), f.email)
      .input('direccion', sql.NVarChar(300), f.direccion);
  }

  /** Inserta o actualiza el familiar principal del paciente. */
  async guardarPrincipal(idPaciente, familiar, tx = null) {
    const pool = tx ? null : await getPool();
    const nuevo = () => (tx ? new sql.Request(tx) : pool.request());
    const actual = await this.obtenerPrincipal(idPaciente, tx);
    if (actual) {
      await this._bind(nuevo(), familiar).input('id', sql.Int, actual.id).query(`
        UPDATE familiares SET nombres = @nombres, apellidos = @apellidos, dpi = @dpi,
          parentesco = @parentesco, telefono = @telefono, email = @email, direccion = @direccion
        WHERE id = @id
      `);
    } else {
      await this._bind(nuevo(), familiar).input('idPaciente', sql.Int, idPaciente).query(`
        INSERT INTO familiares (idPaciente, nombres, apellidos, dpi, parentesco, telefono, email, direccion, principal)
        VALUES (@idPaciente, @nombres, @apellidos, @dpi, @parentesco, @telefono, @email, @direccion, 1)
      `);
    }
    return this.obtenerPrincipal(idPaciente, tx);
  }
}

module.exports = FamiliarRepository;
