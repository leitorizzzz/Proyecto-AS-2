const { sql, getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS
 * Consultas transversales sobre la BD compartida. Cada metodo devuelve
 * las filas ya listas para armar un Reporte; ninguna consulta muta datos.
 */
class ReportesRepository {

  async costosPorPaciente({ idPaciente, desde, hasta }) {
    const pool = await getPool();
    const req = pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta));
    if (idPaciente) req.input('idPaciente', sql.Int, idPaciente);

    const filtro = idPaciente ? 'AND p.id = @idPaciente' : '';
    const r = await req.query(`
      SELECT
        p.id AS idPaciente,
        (p.nombres + ' ' + p.apellidos) AS paciente,
        p.dpi AS dpi,
        ISNULL(disp.totalMedicamentos, 0) AS totalMedicamentos,
        ISNULL(cargos.totalCargos, 0) AS totalCargos,
        (ISNULL(disp.totalMedicamentos, 0) + ISNULL(cargos.totalCargos, 0)) AS totalGeneral
      FROM pacientes p
      LEFT JOIN (
        SELECT idPaciente, SUM(costoTotal) AS totalMedicamentos
        FROM dispensaciones WHERE fecha BETWEEN @desde AND @hasta
        GROUP BY idPaciente
      ) disp ON disp.idPaciente = p.id
      LEFT JOIN (
        SELECT idPaciente, SUM(monto) AS totalCargos
        FROM cargos_servicio WHERE fecha BETWEEN @desde AND @hasta
        GROUP BY idPaciente
      ) cargos ON cargos.idPaciente = p.id
      WHERE (disp.totalMedicamentos IS NOT NULL OR cargos.totalCargos IS NOT NULL)
      ${filtro}
      ORDER BY totalGeneral DESC
    `);
    return r.recordset;
  }

  async analisisMedico({ desde, hasta }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT
          s.especialidad AS especialidad,
          COUNT(DISTINCT s.id) AS solicitudes,
          COUNT(DISTINCT v.id) AS visitasCompletadas,
          SUM(CASE WHEN s.estado = 'cancelada' THEN 1 ELSE 0 END) AS canceladas
        FROM solicitudes_referencia s
        LEFT JOIN visitas_medicas v
          ON v.idSolicitudReferencia = s.id AND v.estado = 'completada'
        WHERE s.fechaCreacion BETWEEN @desde AND @hasta
        GROUP BY s.especialidad
        ORDER BY solicitudes DESC
      `);
    return r.recordset;
  }

  async cobrosPorRango({ desde, hasta }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT
          cm.fechaPago AS fecha,
          (p.nombres + ' ' + p.apellidos) AS paciente,
          'Cuota ' + CAST(cm.mes AS NVARCHAR) + '/' + CAST(cm.anio AS NVARCHAR) AS concepto,
          cm.monto AS monto
        FROM cuotas_mensuales cm
        INNER JOIN pacientes p ON p.id = cm.idPaciente
        WHERE cm.estado = 'pagada' AND cm.fechaPago BETWEEN @desde AND @hasta
        ORDER BY cm.fechaPago DESC
      `);
    return r.recordset;
  }

  async pagosFundacion({ desde, hasta }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT id, fecha, concepto, monto
        FROM pagos_fundacion
        WHERE fecha BETWEEN @desde AND @hasta
        ORDER BY fecha DESC
      `);
    return r.recordset;
  }

  async entradas({ desde, hasta }) {
    const pool = await getPool();
    // Donaciones + cuotas cobradas
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT fecha, concepto, tipo, monto FROM (
          SELECT
            d.fecha AS fecha,
            ('Donacion de ' + dn.nombre + ISNULL(' - ' + d.concepto,'')) AS concepto,
            d.tipo AS tipo,
            d.monto AS monto
          FROM donaciones d INNER JOIN donantes dn ON dn.id = d.idDonante
          WHERE d.fecha BETWEEN @desde AND @hasta
          UNION ALL
          SELECT
            cm.fechaPago AS fecha,
            ('Cuota ' + CAST(cm.mes AS NVARCHAR) + '/' + CAST(cm.anio AS NVARCHAR)
             + ' - ' + p.nombres + ' ' + p.apellidos) AS concepto,
            'cuota' AS tipo,
            cm.monto AS monto
          FROM cuotas_mensuales cm INNER JOIN pacientes p ON p.id = cm.idPaciente
          WHERE cm.estado = 'pagada' AND cm.fechaPago BETWEEN @desde AND @hasta
        ) t
        ORDER BY fecha DESC
      `);
    return r.recordset;
  }

  async examenes({ desde, hasta }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT
          ex.id AS idExamen,
          ex.fechaSolicitud,
          ex.tipo,
          ex.estado,
          (p.nombres + ' ' + p.apellidos) AS paciente,
          CASE WHEN r.id IS NULL THEN 'pendiente' ELSE 'entregado' END AS estadoResultado
        FROM visita_examenes ex
        INNER JOIN visitas_medicas vm ON vm.id = ex.idVisita
        INNER JOIN pacientes p ON p.id = vm.idPaciente
        LEFT JOIN resultados_examenes r ON r.idExamen = ex.id
        WHERE ex.fechaSolicitud BETWEEN @desde AND @hasta
        ORDER BY ex.fechaSolicitud DESC
      `);
    return r.recordset;
  }

  async medicamentosAplicados({ desde, hasta }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT
          d.fecha,
          m.nombre AS medicamento,
          d.cantidad,
          d.costoTotal,
          (p.nombres + ' ' + p.apellidos) AS paciente
        FROM dispensaciones d
        INNER JOIN medicamentos m ON m.id = d.idMedicamento
        INNER JOIN pacientes p ON p.id = d.idPaciente
        WHERE d.fecha BETWEEN @desde AND @hasta
        ORDER BY d.fecha DESC
      `);
    return r.recordset;
  }
}

module.exports = ReportesRepository;
