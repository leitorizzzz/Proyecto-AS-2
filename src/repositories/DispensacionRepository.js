const db = require('./database');
const Dispensacion = require('../models/Dispensacion');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con la base de datos para "dispensaciones".
 */
class DispensacionRepository {

  guardar(dispensacion) {
    const sql = `INSERT INTO dispensaciones
                 (idPaciente, idVisita, idMedicamento, cantidad, costoTotal, fecha)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const resultado = db.prepare(sql).run(
      dispensacion.idPaciente,
      dispensacion.idVisita,
      dispensacion.idMedicamento,
      dispensacion.cantidad,
      dispensacion.costoTotal,
      dispensacion.fecha
    );
    return this.obtenerPorId(resultado.lastInsertRowid);
  }

  obtenerPorId(id) {
    const fila = db.prepare('SELECT * FROM dispensaciones WHERE id = ?').get(id);
    return fila ? new Dispensacion(fila) : null;
  }

  obtenerPorPaciente(idPaciente) {
    const filas = db.prepare(
      'SELECT * FROM dispensaciones WHERE idPaciente = ? ORDER BY fecha DESC'
    ).all(idPaciente);
    return filas.map(f => new Dispensacion(f));
  }
}

module.exports = DispensacionRepository;
