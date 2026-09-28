const { sql, getPool } = require('./database');
const ResultadoExamen = require('../models/ResultadoExamen');

/**
 * CAPA DE ACCESO A DATOS
 * Repositorio de resultados de examenes + operaciones sobre las ordenes
 * pendientes (que viven en visita_examenes, propiedad de pacientes-service,
 * pero en la misma BD).
 */
class ResultadoExamenRepository {

  async listarOrdenesPendientes() {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        ex.id            AS idExamen,
        ex.idVisita      AS idVisita,
        ex.tipo          AS tipo,
        ex.estado        AS estadoOrden,
        ex.fechaSolicitud AS fechaSolicitud,
        vm.idPaciente    AS idPaciente,
        p.nombres        AS pacienteNombres,
        p.apellidos      AS pacienteApellidos,
        p.dpi            AS pacienteDpi
      FROM visita_examenes ex
      INNER JOIN visitas_medicas vm ON vm.id = ex.idVisita
      INNER JOIN pacientes p        ON p.id = vm.idPaciente
      LEFT JOIN resultados_examenes r ON r.idExamen = ex.id
      WHERE r.id IS NULL
      ORDER BY ex.fechaSolicitud DESC
    `);
    return result.recordset;
  }

  async obtenerOrdenPorId(idExamen) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idExamen', sql.Int, idExamen)
      .query(`
        SELECT ex.*, vm.idPaciente
        FROM visita_examenes ex
        INNER JOIN visitas_medicas vm ON vm.id = ex.idVisita
        WHERE ex.id = @idExamen
      `);
    return result.recordset[0] || null;
  }

  async obtenerResultadoPorExamen(idExamen) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idExamen', sql.Int, idExamen)
      .query('SELECT * FROM resultados_examenes WHERE idExamen = @idExamen');
    return result.recordset[0] ? new ResultadoExamen(result.recordset[0]) : null;
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM resultados_examenes WHERE id = @id');
    return result.recordset[0] ? new ResultadoExamen(result.recordset[0]) : null;
  }

  async guardar(resultado) {
    const pool = await getPool();
    const req = pool.request()
      .input('idExamen', sql.Int, resultado.idExamen)
      .input('tipoResultado', sql.NVarChar(20), resultado.tipoResultado)
      .input('valorTexto', sql.NVarChar(sql.MAX), resultado.valorTexto)
      .input('valorNumerico', sql.Decimal(18, 4), resultado.valorNumerico)
      .input('archivoAdjunto', sql.NVarChar(500), resultado.archivoAdjunto)
      .input('estado', sql.NVarChar(20), resultado.estado)
      .input('fechaDisponible',
        sql.DateTime2,
        resultado.fechaDisponible ? new Date(resultado.fechaDisponible) : null);
    const inserted = await req.query(`
      INSERT INTO resultados_examenes
        (idExamen, tipoResultado, valorTexto, valorNumerico, archivoAdjunto, estado, fechaDisponible)
      OUTPUT INSERTED.id
      VALUES (@idExamen, @tipoResultado, @valorTexto, @valorNumerico, @archivoAdjunto, @estado, @fechaDisponible)
    `);
    return this.obtenerPorId(inserted.recordset[0].id);
  }

  async marcarOrdenComoDisponible(idExamen) {
    const pool = await getPool();
    await pool.request()
      .input('idExamen', sql.Int, idExamen)
      .query(`
        UPDATE visita_examenes
        SET estado = 'disponible'
        WHERE id = @idExamen
      `);
  }

  async obtenerPrecioBase(tipoExamen) {
    const pool = await getPool();
    const result = await pool.request()
      .input('tipo', sql.NVarChar(200), tipoExamen)
      .query('SELECT precioBase FROM examenes_precios WHERE tipo = @tipo');
    return result.recordset[0] ? Number(result.recordset[0].precioBase) : null;
  }
}

module.exports = ResultadoExamenRepository;
