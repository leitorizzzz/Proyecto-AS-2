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
      .input('estado', sql.NVarChar(30), notif.estado)
      .input('maxIntentos', sql.Int, notif.maxIntentos)
      .query(`
        INSERT INTO notificaciones
          (idPaciente, tipoEvento, destinatarioEmail, asunto, cuerpo, estado, maxIntentos)
        OUTPUT INSERTED.*
        VALUES (@idPaciente, @tipoEvento, @destinatarioEmail, @asunto, @cuerpo, @estado, @maxIntentos)
      `);
    return new Notificacion(r.recordset[0]);
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM notificaciones WHERE id = @id');
    return r.recordset[0] ? new Notificacion(r.recordset[0]) : null;
  }

  async marcarEnviada(id, intentos) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('intentos', sql.Int, intentos)
      .query(`
        UPDATE notificaciones
        SET estado = 'enviada',
            fechaEnvio = SYSUTCDATETIME(),
            fechaUltimoIntento = SYSUTCDATETIME(),
            intentos = @intentos,
            proximoIntento = NULL,
            mensajeError = NULL
        WHERE id = @id
      `);
  }

  async marcarFalloConReintento(id, intentos, proximoIntento, mensaje) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('intentos', sql.Int, intentos)
      .input('proximoIntento', sql.DateTime2, proximoIntento)
      .input('mensaje', sql.NVarChar(500), String(mensaje).slice(0, 499))
      .query(`
        UPDATE notificaciones
        SET estado = 'fallida',
            intentos = @intentos,
            proximoIntento = @proximoIntento,
            fechaUltimoIntento = SYSUTCDATETIME(),
            mensajeError = @mensaje
        WHERE id = @id
      `);
  }

  async marcarFalloDefinitivo(id, intentos, mensaje) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('intentos', sql.Int, intentos)
      .input('mensaje', sql.NVarChar(500), String(mensaje).slice(0, 499))
      .query(`
        UPDATE notificaciones
        SET estado = 'fallida_definitiva',
            intentos = @intentos,
            proximoIntento = NULL,
            fechaUltimoIntento = SYSUTCDATETIME(),
            mensajeError = @mensaje
        WHERE id = @id
      `);
  }

  async resetearParaReintento(id) {
    // Reintento manual: deja proximoIntento = ahora para que el job
    // la agarre en la proxima pasada.
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE notificaciones
        SET estado = 'pendiente',
            proximoIntento = SYSUTCDATETIME(),
            mensajeError = NULL
        WHERE id = @id
      `);
  }

  async listar({ limit = 50, estado } = {}) {
    const pool = await getPool();
    const req = pool.request().input('limit', sql.Int, limit);
    let where = '';
    if (estado) {
      req.input('estado', sql.NVarChar(30), estado);
      where = 'WHERE estado = @estado';
    }
    const r = await req.query(`
      SELECT TOP (@limit) * FROM notificaciones
      ${where}
      ORDER BY fechaCreacion DESC
    `);
    return r.recordset.map(f => new Notificacion(f));
  }

  async listarListasParaReintento(limit = 20) {
    const pool = await getPool();
    const r = await pool.request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) * FROM notificaciones
        WHERE (
          (estado = 'pendiente' AND proximoIntento IS NOT NULL AND proximoIntento <= SYSUTCDATETIME())
          OR
          (estado = 'fallida'   AND intentos < maxIntentos
           AND (proximoIntento IS NULL OR proximoIntento <= SYSUTCDATETIME()))
        )
        ORDER BY fechaCreacion ASC
      `);
    return r.recordset.map(f => new Notificacion(f));
  }
}

module.exports = NotificacionRepository;
