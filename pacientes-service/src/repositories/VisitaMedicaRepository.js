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
      .input('idFichaMedica', sql.Int, visita.idFichaMedica)
      .query(`
        INSERT INTO visitas_medicas
          (idSolicitudReferencia, idPaciente, idMedicoEspecialista, estado, idFichaMedica)
        OUTPUT INSERTED.id
        VALUES (@idSolicitudReferencia, @idPaciente, @idMedicoEspecialista, @estado, @idFichaMedica)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  /** Caso 14: intento de cierre sin campos obligatorios. */
  async marcarIncompleta(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE visitas_medicas SET estado = 'incompleta'
              WHERE id = @id AND estado IN ('en_atencion', 'incompleta')`);
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

  /**
   * Cierre atomico de la visita (caso 19). En UNA transaccion:
   *   1. bloquea la fila de la visita (UPDLOCK) y verifica que siga abierta
   *      y que no tenga cargo, para que dos cierres simultaneos o un
   *      reintento no dupliquen el cobro (respaldo: UX_cargos_visita);
   *   2. lee tarifa de consulta, examenes con su precio y dispensaciones;
   *   3. calcularCargo(datos) -> CargoVisita (regla de negocio en el servicio);
   *   4. inserta cargos_servicio + cargos_detalle, marca la visita
   *      'completada' y la solicitud enlazada 'completada'.
   * Si cualquier paso falla, no queda nada escrito.
   */
  async completarConCargo(idVisita, calcularCargo) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const rq = () => new sql.Request(tx);
    try {
      const visita = (await rq().input('id', sql.Int, idVisita).query(
        'SELECT * FROM visitas_medicas WITH (UPDLOCK, ROWLOCK) WHERE id = @id'
      )).recordset[0];
      if (!visita) throw Object.assign(new Error('Visita medica no encontrada'), { status: 404 });
      if (!['en_atencion', 'incompleta'].includes(visita.estado)) {
        throw Object.assign(
          new Error(`La visita ya no esta abierta (estado: '${visita.estado}'); no se genera otro cargo`),
          { status: 409 }
        );
      }
      const previo = (await rq().input('id', sql.Int, idVisita).query(
        'SELECT id FROM cargos_servicio WHERE idVisita = @id AND idDispensacion IS NULL'
      )).recordset[0];
      if (previo) {
        throw Object.assign(new Error(`La visita ${idVisita} ya tiene el cargo ${previo.id}`), { status: 409 });
      }

      const tarifa = (await rq().input('codigo', sql.NVarChar(50), 'consulta_especialista').query(
        'SELECT codigo, descripcion, precioBase FROM tarifas_servicio WHERE codigo = @codigo'
      )).recordset[0] || null;
      const examenes = (await rq().input('id', sql.Int, idVisita).query(`
        SELECT ve.*, ep.precioBase AS precioCatalogo
        FROM visita_examenes ve
        LEFT JOIN examenes_precios ep ON ep.tipo = ve.tipo
        WHERE ve.idVisita = @id
        ORDER BY ve.id
      `)).recordset;
      const dispensaciones = (await rq().input('id', sql.Int, idVisita).query(`
        SELECT d.*, m.nombre AS medicamento, m.precioUnitario
        FROM dispensaciones d
        INNER JOIN medicamentos m ON m.id = d.idMedicamento
        WHERE d.idVisita = @id
        ORDER BY d.id
      `)).recordset;

      const familiar = (await rq().input('idPaciente', sql.Int, visita.idPaciente).query(
        'SELECT * FROM familiares WHERE idPaciente = @idPaciente AND principal = 1 AND activo = 1'
      )).recordset[0] || null;

      const cargo = calcularCargo({ visita, tarifa, examenes, dispensaciones, familiar });

      const insertado = (await rq()
        .input('idPaciente', sql.Int, cargo.idPaciente)
        .input('concepto', sql.NVarChar(300), cargo.concepto)
        .input('monto', sql.Decimal(10, 2), cargo.monto)
        .input('idVisita', sql.Int, cargo.idVisita)
        .input('idFamiliar', sql.Int, cargo.idFamiliar)
        .query(`
          INSERT INTO cargos_servicio (idPaciente, concepto, monto, estado, idVisita, idFamiliar, origen)
          OUTPUT INSERTED.id
          VALUES (@idPaciente, @concepto, @monto, 'pendiente', @idVisita, @idFamiliar, 'visita')
        `)).recordset[0];
      for (const d of cargo.detalles) {
        await rq()
          .input('idCargo', sql.Int, insertado.id)
          .input('rubro', sql.NVarChar(20), d.rubro)
          .input('descripcion', sql.NVarChar(300), d.descripcion)
          .input('idReferencia', sql.Int, d.idReferencia ?? null)
          .input('montoBase', sql.Decimal(10, 2), d.montoBase)
          .input('descuento', sql.Decimal(10, 2), d.descuento)
          .input('monto', sql.Decimal(10, 2), d.monto)
          .query(`
            INSERT INTO cargos_detalle (idCargo, rubro, descripcion, idReferencia, montoBase, descuento, monto)
            VALUES (@idCargo, @rubro, @descripcion, @idReferencia, @montoBase, @descuento, @monto)
          `);
      }

      await rq().input('id', sql.Int, idVisita).query(`
        UPDATE visitas_medicas SET estado = 'completada', fechaCompletada = SYSUTCDATETIME()
        WHERE id = @id
      `);
      const sol = await rq().input('idSolicitud', sql.Int, visita.idSolicitudReferencia).query(`
        UPDATE solicitudes_referencia
        SET estado = 'completada', fechaActualizacion = SYSUTCDATETIME()
        WHERE id = @idSolicitud AND estado = 'en_atencion'
      `);
      if (sol.rowsAffected[0] !== 1) {
        throw Object.assign(
          new Error(`La solicitud ${visita.idSolicitudReferencia} no esta en atencion; no se cierra la visita`),
          { status: 409 }
        );
      }

      await tx.commit();
      cargo.id = insertado.id;
      return { visita: await this.obtenerPorId(idVisita), cargo };
    } catch (err) {
      await tx.rollback().catch(() => {});
      // Respaldo del UNIQUE filtrado ante dos cierres simultaneos.
      if (err.number === 2601 || err.number === 2627) {
        throw Object.assign(new Error(`La visita ${idVisita} ya tiene cargo generado`), { status: 409 });
      }
      throw err;
    }
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

  async agregarPrescripcion(idVisita, { medicamento, dosis, indicaciones, idMedicamento, cantidadPrescrita }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idVisita', sql.Int, idVisita)
      .input('medicamento', sql.NVarChar(200), medicamento)
      .input('dosis', sql.NVarChar(200), dosis || null)
      .input('indicaciones', sql.NVarChar(500), indicaciones || null)
      .input('idMedicamento', sql.Int, idMedicamento || null)
      .input('cantidadPrescrita', sql.Int, cantidadPrescrita)
      .query(`
        INSERT INTO visita_prescripciones
          (idVisita, medicamento, dosis, indicaciones, idMedicamento, estado, cantidadPrescrita, cantidadEntregada)
        OUTPUT INSERTED.*
        VALUES
          (@idVisita, @medicamento, @dosis, @indicaciones, @idMedicamento, 'pendiente', @cantidadPrescrita, 0)
      `);
    return result.recordset[0];
  }
}

module.exports = VisitaMedicaRepository;
