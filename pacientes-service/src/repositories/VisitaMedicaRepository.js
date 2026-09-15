const { sql, getPool } = require('./database');
const VisitaMedica = require('../models/VisitaMedica');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "visitas_medicas",
 * "visita_examenes" y "visita_prescripciones".
 */
class VisitaMedicaRepository {

  async _cargarHijos(visita) {
    const pool = await getPool();
    const examenes = await pool.request()
      .input('idVisita', sql.Int, visita.id)
      .query('SELECT * FROM visita_examenes WHERE idVisita = @idVisita ORDER BY id');
    const prescripciones = await pool.request()
      .input('idVisita', sql.Int, visita.id)
      .query('SELECT * FROM visita_prescripciones WHERE idVisita = @idVisita ORDER BY id');
    visita.examenes = examenes.recordset;
    visita.prescripciones = prescripciones.recordset;
    return visita;
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM visitas_medicas WHERE id = @id');
    if (!result.recordset[0]) return null;
    const visita = new VisitaMedica(result.recordset[0]);
    return this._cargarHijos(visita);
  }

  async obtenerPorSolicitud(idSolicitud) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idSolicitudReferencia', sql.Int, idSolicitud)
      .query('SELECT * FROM visitas_medicas WHERE idSolicitudReferencia = @idSolicitudReferencia');
    if (!result.recordset[0]) return null;
    const visita = new VisitaMedica(result.recordset[0]);
    return this._cargarHijos(visita);
  }

  async obtenerPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM visitas_medicas WHERE idPaciente = @idPaciente ORDER BY fecha DESC');
    const visitas = [];
    for (const row of result.recordset) {
      const v = new VisitaMedica(row);
      // eslint-disable-next-line no-await-in-loop
      visitas.push(await this._cargarHijos(v));
    }
    return visitas;
  }

  async guardar(visita) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idSolicitudReferencia', sql.Int, visita.idSolicitudReferencia)
      .input('idPaciente', sql.Int, visita.idPaciente)
      .input('idMedicoEspecialista', sql.Int, visita.idMedicoEspecialista)
      .input('estado', sql.NVarChar(30), visita.estado)
      .query(`
        INSERT INTO visitas_medicas
          (idSolicitudReferencia, idPaciente, idMedicoEspecialista, estado)
        OUTPUT INSERTED.id
        VALUES (@idSolicitudReferencia, @idPaciente, @idMedicoEspecialista, @estado)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  async actualizarClinico(id, { diagnostico, observaciones }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('diagnostico', sql.NVarChar(sql.MAX), diagnostico)
      .input('observaciones', sql.NVarChar(sql.MAX), observaciones)
      .query(`
        UPDATE visitas_medicas
        SET diagnostico = @diagnostico,
            observaciones = @observaciones
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  async marcarCompletada(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE visitas_medicas
        SET estado = 'completada',
            fechaCompletada = SYSUTCDATETIME()
        WHERE id = @id
      `);
    return this.obtenerPorId(id);
  }

  async agregarExamen(idVisita, { tipo }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idVisita', sql.Int, idVisita)
      .input('tipo', sql.NVarChar(200), tipo)
      .query(`
        INSERT INTO visita_examenes (idVisita, tipo)
        OUTPUT INSERTED.*
        VALUES (@idVisita, @tipo)
      `);
    return result.recordset[0];
  }

  async agregarPrescripcion(idVisita, { medicamento, dosis, indicaciones }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idVisita', sql.Int, idVisita)
      .input('medicamento', sql.NVarChar(200), medicamento)
      .input('dosis', sql.NVarChar(200), dosis || null)
      .input('indicaciones', sql.NVarChar(500), indicaciones || null)
      .query(`
        INSERT INTO visita_prescripciones (idVisita, medicamento, dosis, indicaciones)
        OUTPUT INSERTED.*
        VALUES (@idVisita, @medicamento, @dosis, @indicaciones)
      `);
    return result.recordset[0];
  }
}

module.exports = VisitaMedicaRepository;
