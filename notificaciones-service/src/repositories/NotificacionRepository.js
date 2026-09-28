const { sql, getPool } = require('./database');
const Notificacion = require('../models/Notificacion');

class NotificacionRepository {

  async guardar(notif) {
    const pool = await getPool();
    const r = await pool.request()
      .input('idPaciente', sql.Int, notif.idPaciente)
      .input('tipoEvento', sql.NVarChar(50), notif.tipoEvento)
      .input('destinatarioEmail', sql.NVarChar(200), notif.destinatarioEmail)
      .input('asunto', sql.NVarChar(300), notif.asunto)
      .input('cuerpo', sql.NVarChar(sql.MAX), notif.cuerpo)
      .input('estado', sql.NVarChar(20), notif.estado)
      .query(`
        INSERT INTO notificaciones
          (idPaciente, tipoEvento, destinatarioEmail, asunto, cuerpo, estado)
        OUTPUT INSERTED.*
        VALUES (@idPaciente, @tipoEvento, @destinatarioEmail, @asunto, @cuerpo, @estado)
      `);
    return new Notificacion(r.recordset[0]);
  }

  async marcarEnviada(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE notificaciones
        SET estado='enviada', fechaEnvio = SYSUTCDATETIME(), mensajeError = NULL
        WHERE id = @id
      `);
  }

  async marcarFallida(id, mensaje) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('mensaje', sql.NVarChar(500), String(mensaje).slice(0, 499))
      .query(`
        UPDATE notificaciones
        SET estado='fallida', mensajeError = @mensaje
        WHERE id = @id
      `);
  }

  async listar({ limit = 50 } = {}) {
    const pool = await getPool();
    const r = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) * FROM notificaciones ORDER BY fechaCreacion DESC
      `);
    return r.recordset.map(f => new Notificacion(f));
  }
}

module.exports = NotificacionRepository;
