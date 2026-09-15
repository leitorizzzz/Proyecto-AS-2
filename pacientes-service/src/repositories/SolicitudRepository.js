const { sql, getPool } = require('./database');
const SolicitudReferencia = require('../models/SolicitudReferencia');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "solicitudes_referencia".
 */
class SolicitudRepository {

  async obtenerTodas() {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT * FROM solicitudes_referencia ORDER BY fechaCreacion DESC');
    return result.recordset.map(r => new SolicitudReferencia(r));
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM solicitudes_referencia WHERE id = @id');
    return result.recordset[0] ? new SolicitudReferencia(result.recordset[0]) : null;
  }

  async obtenerPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM solicitudes_referencia WHERE idPaciente = @idPaciente ORDER BY fechaCreacion DESC');
    return result.recordset.map(r => new SolicitudReferencia(r));
  }

  /**
   * RN-02: existe alguna solicitud activa (no completada ni cancelada)
   * para este paciente en esta especialidad.
   */
  async existeSolicitudActiva(idPaciente, especialidad) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .input('especialidad', sql.NVarChar(100), especialidad)
      .query(`
        SELECT TOP 1 id FROM solicitudes_referencia
        WHERE idPaciente = @idPaciente
          AND especialidad = @especialidad
          AND estado IN ('pendiente_asignacion', 'cita_asignada', 'en_atencion')
      `);
    return result.recordset.length > 0;
  }

  async guardar(solicitud) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, solicitud.idPaciente)
      .input('idMedicoGeneral', sql.Int, solicitud.idMedicoGeneral)
      .input('especialidad', sql.NVarChar(100), solicitud.especialidad)
      .input('motivo', sql.NVarChar(1000), solicitud.motivo)
      .input('estado', sql.NVarChar(30), solicitud.estado)
      .query(`
        INSERT INTO solicitudes_referencia
          (idPaciente, idMedicoGeneral, especialidad, motivo, estado)
        OUTPUT INSERTED.id
        VALUES (@idPaciente, @idMedicoGeneral, @especialidad, @motivo, @estado)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async asignarCita(id, { fechaCita, horaCita, idMedicoEspecialista }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('fechaCita', sql.Date, new Date(fechaCita))
      .input('horaCita', sql.NVarChar(8), horaCita) // HH:mm o HH:mm:ss
      .input('idMedicoEspecialista', sql.Int, idMedicoEspecialista)
      .query(`
        UPDATE solicitudes_referencia
        SET fechaCita = @fechaCita,
            horaCita = CONVERT(TIME, @horaCita),
            idMedicoEspecialista = @idMedicoEspecialista,
            estado = 'cita_asignada',
            fechaActualizacion = SYSUTCDATETIME()
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  async cambiarEstado(id, nuevoEstado) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('estado', sql.NVarChar(30), nuevoEstado)
      .query(`
        UPDATE solicitudes_referencia
        SET estado = @estado,
            fechaActualizacion = SYSUTCDATETIME()
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }
}

module.exports = SolicitudRepository;
