const { sql, getPool } = require('./database');
const PrecioExamen = require('../models/PrecioExamen');

/**
 * CAPA DE ACCESO A DATOS
 * Catalogo de precios base por tipo de examen (examenes_precios).
 */
class PrecioExamenRepository {

  async listar() {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, tipo, precioBase FROM examenes_precios ORDER BY tipo');
    return result.recordset.map(r => new PrecioExamen(r));
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id, tipo, precioBase FROM examenes_precios WHERE id = @id');
    return result.recordset[0] ? new PrecioExamen(result.recordset[0]) : null;
  }

  async obtenerPorTipo(tipo) {
    const pool = await getPool();
    const result = await pool.request()
      .input('tipo', sql.NVarChar(200), tipo)
      .query('SELECT id, tipo, precioBase FROM examenes_precios WHERE tipo = @tipo');
    return result.recordset[0] ? new PrecioExamen(result.recordset[0]) : null;
  }

  async guardar(precio) {
    const pool = await getPool();
    const result = await pool.request()
      .input('tipo', sql.NVarChar(200), precio.tipo)
      .input('precioBase', sql.Decimal(10, 2), precio.precioBase)
      .query(`
        INSERT INTO examenes_precios (tipo, precioBase)
        OUTPUT INSERTED.id
        VALUES (@tipo, @precioBase)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async actualizar(id, precio) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.NVarChar(200), precio.tipo)
      .input('precioBase', sql.Decimal(10, 2), precio.precioBase)
      .query('UPDATE examenes_precios SET tipo = @tipo, precioBase = @precioBase WHERE id = @id');
    return this.obtenerPorId(id);
  }
}

module.exports = PrecioExamenRepository;
