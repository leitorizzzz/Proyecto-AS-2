const { sql, getPool } = require('./database');
const Donante = require('../models/Donante');
const Donacion = require('../models/Donacion');

class DonanteRepository {

  async guardarDonante(donante) {
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar(200), donante.nombre)
      .input('telefono', sql.NVarChar(30), donante.telefono)
      .input('email', sql.NVarChar(200), donante.email)
      .input('direccion', sql.NVarChar(300), donante.direccion)
      .query(`
        INSERT INTO donantes (nombre, telefono, email, direccion)
        OUTPUT INSERTED.*
        VALUES (@nombre, @telefono, @email, @direccion)
      `);
    return new Donante(result.recordset[0]);
  }

  async listarDonantes() {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM donantes ORDER BY nombre');
    return result.recordset.map(r => new Donante(r));
  }

  async obtenerDonante(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM donantes WHERE id=@id');
    return result.recordset[0] ? new Donante(result.recordset[0]) : null;
  }

  async guardarDonacion(donacion) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idDonante', sql.Int, donacion.idDonante)
      .input('monto', sql.Decimal(10, 2), donacion.monto)
      .input('tipo', sql.NVarChar(20), donacion.tipo)
      .input('concepto', sql.NVarChar(500), donacion.concepto)
      .query(`
        INSERT INTO donaciones (idDonante, monto, tipo, concepto)
        OUTPUT INSERTED.*
        VALUES (@idDonante, @monto, @tipo, @concepto)
      `);
    return new Donacion(result.recordset[0]);
  }

  async listarDonaciones({ desde, hasta } = {}) {
    const pool = await getPool();
    if (desde && hasta) {
      const result = await pool.request()
        .input('desde', sql.DateTime2, new Date(desde))
        .input('hasta', sql.DateTime2, new Date(hasta))
        .query(`
          SELECT d.*, dn.nombre AS donante
          FROM donaciones d INNER JOIN donantes dn ON dn.id = d.idDonante
          WHERE d.fecha BETWEEN @desde AND @hasta
          ORDER BY d.fecha DESC
        `);
      return result.recordset;
    }
    const result = await pool.request().query(`
      SELECT d.*, dn.nombre AS donante
      FROM donaciones d INNER JOIN donantes dn ON dn.id = d.idDonante
      ORDER BY d.fecha DESC
    `);
    return result.recordset;
  }
}

module.exports = DonanteRepository;
