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
      -- Costos cobrados al paciente, por rubro. Sale solo de cargos_servicio
      -- (y su desglose cargos_detalle): el cargo de la visita ya incluye la
      -- farmacia dispensada, asi que sumar tambien dispensaciones contaba
      -- dos veces los medicamentos. Cargos manuales sin desglose = "otros".
      SELECT
        p.id AS idPaciente,
        (p.nombres + ' ' + p.apellidos) AS paciente,
        p.dpi AS dpi,
        c.consulta, c.laboratorio, c.farmacia, c.otros,
        (c.consulta + c.laboratorio + c.farmacia + c.otros) AS totalGeneral
      FROM pacientes p
      INNER JOIN (
        SELECT cs.idPaciente,
               SUM(CASE WHEN d.rubro = 'consulta'    THEN d.monto ELSE 0 END) AS consulta,
               SUM(CASE WHEN d.rubro = 'laboratorio' THEN d.monto ELSE 0 END) AS laboratorio,
               SUM(CASE WHEN d.rubro = 'farmacia'    THEN d.monto ELSE 0 END) AS farmacia,
               SUM(CASE WHEN d.id IS NULL THEN cs.monto ELSE 0 END) AS otros
        FROM cargos_servicio cs
        LEFT JOIN cargos_detalle d ON d.idCargo = cs.id
        WHERE cs.fecha >= @desde AND cs.fecha < @hasta
        GROUP BY cs.idPaciente
      ) c ON c.idPaciente = p.id
      WHERE 1 = 1 ${filtro}
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
        WHERE s.fechaCreacion >= @desde AND s.fechaCreacion < @hasta
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
        -- Lo cobrado a las familias: cuotas pagadas y abonos a cargos de
        -- servicio (consulta, laboratorio, farmacia). Antes los abonos no
        -- aparecian en ningun reporte de ingresos.
        SELECT fecha, paciente, concepto, monto FROM (
          SELECT
            cm.fechaPago AS fecha,
            (p.nombres + ' ' + p.apellidos) AS paciente,
            'Cuota ' + CAST(cm.mes AS NVARCHAR) + '/' + CAST(cm.anio AS NVARCHAR) AS concepto,
            cm.monto AS monto
          FROM cuotas_mensuales cm
          INNER JOIN pacientes p ON p.id = cm.idPaciente
          WHERE cm.estado = 'pagada' AND cm.fechaPago >= @desde AND cm.fechaPago < @hasta
          UNION ALL
          SELECT
            a.fecha AS fecha,
            (p.nombres + ' ' + p.apellidos) AS paciente,
            'Abono a cargo #' + CAST(cs.id AS NVARCHAR) + ': ' + cs.concepto AS concepto,
            a.monto AS monto
          FROM abonos_cargo a
          INNER JOIN cargos_servicio cs ON cs.id = a.idCargo
          INNER JOIN pacientes p ON p.id = cs.idPaciente
          WHERE a.fecha >= @desde AND a.fecha < @hasta
        ) t
        ORDER BY fecha DESC
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
        WHERE fecha >= @desde AND fecha < @hasta
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
          WHERE d.fecha >= @desde AND d.fecha < @hasta
          UNION ALL
          SELECT
            cm.fechaPago AS fecha,
            ('Cuota ' + CAST(cm.mes AS NVARCHAR) + '/' + CAST(cm.anio AS NVARCHAR)
             + ' - ' + p.nombres + ' ' + p.apellidos) AS concepto,
            'cuota' AS tipo,
            cm.monto AS monto
          FROM cuotas_mensuales cm INNER JOIN pacientes p ON p.id = cm.idPaciente
          WHERE cm.estado = 'pagada' AND cm.fechaPago >= @desde AND cm.fechaPago < @hasta
          UNION ALL
          SELECT
            a.fecha AS fecha,
            ('Abono a cargo #' + CAST(cs.id AS NVARCHAR) + ' - ' + p.nombres + ' ' + p.apellidos) AS concepto,
            'abono' AS tipo,
            a.monto AS monto
          FROM abonos_cargo a
          INNER JOIN cargos_servicio cs ON cs.id = a.idCargo
          INNER JOIN pacientes p ON p.id = cs.idPaciente
          WHERE a.fecha >= @desde AND a.fecha < @hasta
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
        WHERE ex.fechaSolicitud >= @desde AND ex.fechaSolicitud < @hasta
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
        WHERE d.fecha >= @desde AND d.fecha < @hasta
        ORDER BY d.fecha DESC
      `);
    return r.recordset;
  }
}

module.exports = ReportesRepository;
