const db = require('./database');
const Medicamento = require('../models/Medicamento');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con la base de datos para "medicamentos".
 * No contiene ninguna regla de negocio.
 */
class MedicamentoRepository {

  obtenerTodos() {
    const filas = db.prepare('SELECT * FROM medicamentos').all();
    return filas.map(f => new Medicamento(f));
  }

  obtenerPorId(id) {
    const fila = db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(id);
    return fila ? new Medicamento(fila) : null;
  }

  guardar(medicamento) {
    const sql = `INSERT INTO medicamentos (nombre, presentacion, stock, precioUnitario)
                 VALUES (?, ?, ?, ?)`;
    const resultado = db.prepare(sql).run(
      medicamento.nombre,
      medicamento.presentacion,
      medicamento.stock,
      medicamento.precioUnitario
    );
    return this.obtenerPorId(resultado.lastInsertRowid);
  }

  actualizar(id, datos) {
    const sql = `UPDATE medicamentos
                 SET nombre = ?, presentacion = ?, stock = ?, precioUnitario = ?
                 WHERE id = ?`;
    db.prepare(sql).run(
      datos.nombre, datos.presentacion, datos.stock, datos.precioUnitario, id
    );
    return this.obtenerPorId(id);
  }

  actualizarStock(id, nuevoStock) {
    db.prepare('UPDATE medicamentos SET stock = ? WHERE id = ?').run(nuevoStock, id);
  }

  eliminar(id) {
    const resultado = db.prepare('DELETE FROM medicamentos WHERE id = ?').run(id);
    return resultado.changes > 0;
  }
}

module.exports = MedicamentoRepository;
