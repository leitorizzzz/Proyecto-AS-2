const { sql, getPool } = require('./database');
const Medicamento = require('../models/Medicamento');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "medicamentos".
 * No contiene ninguna regla de negocio.
 */
class MedicamentoRepository {

  async obtenerTodos() {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM medicamentos ORDER BY id');
    return result.recordset.map(f => new Medicamento(f));
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM medicamentos WHERE id = @id');
    return result.recordset[0] ? new Medicamento(result.recordset[0]) : null;
  }

  async guardar(medicamento) {
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre', sql.NVarChar(200), medicamento.nombre)
      .input('presentacion', sql.NVarChar(200), medicamento.presentacion)
      .input('stock', sql.Int, medicamento.stock)
      .input('precioUnitario', sql.Decimal(10, 2), medicamento.precioUnitario)
      .query(`
        INSERT INTO medicamentos (nombre, presentacion, stock, precioUnitario)
        OUTPUT INSERTED.id
        VALUES (@nombre, @presentacion, @stock, @precioUnitario)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async actualizar(id, datos) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(200), datos.nombre)
      .input('presentacion', sql.NVarChar(200), datos.presentacion)
      .input('stock', sql.Int, datos.stock)
      .input('precioUnitario', sql.Decimal(10, 2), datos.precioUnitario)
      .query(`
        UPDATE medicamentos
        SET nombre = @nombre, presentacion = @presentacion,
            stock = @stock, precioUnitario = @precioUnitario
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  async actualizarStock(id, nuevoStock) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('stock', sql.Int, nuevoStock)
      .query('UPDATE medicamentos SET stock = @stock WHERE id = @id');
  }

  async eliminar(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM medicamentos WHERE id = @id');
    return result.rowsAffected[0] > 0;
  }
}

module.exports = MedicamentoRepository;
