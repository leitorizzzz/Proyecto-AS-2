const { sql, getPool } = require('./database');
const Dispensacion = require('../models/Dispensacion');

/**
 * CAPA DE ACCESO A DATOS (Patron Repositorio)
 * Unica responsable de hablar con SQL Server para "dispensaciones".
 */
class DispensacionRepository {

  async guardar(dispensacion) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, dispensacion.idPaciente)
      .input('idVisita', sql.Int, dispensacion.idVisita)
      .input('idMedicamento', sql.Int, dispensacion.idMedicamento)
      .input('cantidad', sql.Int, dispensacion.cantidad)
      .input('costoTotal', sql.Decimal(10, 2), dispensacion.costoTotal)
      .input('fecha', sql.DateTime2, new Date(dispensacion.fecha))
      .query(`
        INSERT INTO dispensaciones
          (idPaciente, idVisita, idMedicamento, cantidad, costoTotal, fecha)
        OUTPUT INSERTED.id
        VALUES (@idPaciente, @idVisita, @idMedicamento, @cantidad, @costoTotal, @fecha)
      `);
    return this.obtenerPorId(result.recordset[0].id);
  }

  /**
   * Despacho atomico (casos 18 y 19). En UNA transaccion:
   *   1. bloquea primero la visita (mismo orden que el cierre de la visita,
   *      asi no hay interbloqueo) y luego la prescripcion;
   *   2. descuenta stock solo si alcanza (UPDATE condicionado);
   *   3. suma lo entregado sin pasarse de lo prescrito y fija el estado
   *      pendiente -> parcial -> dispensada (UPDATE condicionado; RN-06);
   *   4. inserta la dispensacion y suma su costo a visitas_medicas.costoFarmacia;
   *   5. si la visita ya esta cerrada, genera el cargo complementario de
   *      farmacia (origen 'dispensacion') en la cuenta del familiar.
   * Cualquier condicion que no se cumpla revierte todo.
   */
  async registrarDespacho({ idPrescripcion, idVisita, idPaciente, idMedicamento, medicamento,
                            cantidad, montoBase, costoTotal }) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const rq = () => new sql.Request(tx);
    const conflicto = msg => Object.assign(new Error(msg), { status: 409 });
    try {
      const visita = (await rq().input('idVisita', sql.Int, idVisita).query(
        'SELECT id, estado FROM visitas_medicas WITH (UPDLOCK, ROWLOCK) WHERE id = @idVisita'
      )).recordset[0];
      if (!visita) throw Object.assign(new Error(`No existe la visita ${idVisita}`), { status: 404 });
      await rq().input('id', sql.Int, idPrescripcion).query(
        'SELECT id FROM visita_prescripciones WITH (UPDLOCK, ROWLOCK) WHERE id = @id'
      );

      const stock = await rq()
        .input('idMedicamento', sql.Int, idMedicamento)
        .input('cantidad', sql.Int, cantidad)
        .query(`UPDATE medicamentos SET stock = stock - @cantidad
                WHERE id = @idMedicamento AND activo = 1 AND stock >= @cantidad`);
      if (stock.rowsAffected[0] !== 1) throw conflicto(`Stock insuficiente de ${medicamento} o medicamento desactivado`);

      const rx = await rq()
        .input('id', sql.Int, idPrescripcion)
        .input('cantidad', sql.Int, cantidad)
        .query(`
          UPDATE visita_prescripciones
          SET cantidadEntregada = cantidadEntregada + @cantidad,
              estado = CASE WHEN cantidadPrescrita IS NULL
                              OR cantidadEntregada + @cantidad >= cantidadPrescrita
                            THEN 'dispensada' ELSE 'parcial' END,
              fechaDispensacion = SYSUTCDATETIME()
          OUTPUT INSERTED.estado, INSERTED.cantidadPrescrita, INSERTED.cantidadEntregada
          WHERE id = @id AND estado IN ('pendiente', 'parcial')
            AND (cantidadPrescrita IS NULL OR cantidadEntregada + @cantidad <= cantidadPrescrita)
        `);
      if (rx.rowsAffected[0] !== 1) {
        throw conflicto(`La prescripcion ${idPrescripcion} ya fue despachada o la cantidad supera lo pendiente`);
      }
      const estadoRx = rx.recordset[0];

      const disp = (await rq()
        .input('idPaciente', sql.Int, idPaciente)
        .input('idVisita', sql.Int, idVisita)
        .input('idMedicamento', sql.Int, idMedicamento)
        .input('cantidad', sql.Int, cantidad)
        .input('costoTotal', sql.Decimal(10, 2), costoTotal)
        .input('montoBase', sql.Decimal(10, 2), montoBase)
        .input('idPrescripcion', sql.Int, idPrescripcion)
        .query(`
          INSERT INTO dispensaciones (idPaciente, idVisita, idMedicamento, cantidad, costoTotal, montoBase, idPrescripcion)
          OUTPUT INSERTED.*
          VALUES (@idPaciente, @idVisita, @idMedicamento, @cantidad, @costoTotal, @montoBase, @idPrescripcion)
        `)).recordset[0];

      await rq().input('id', sql.Int, idPrescripcion).input('idDisp', sql.Int, disp.id).query(
        'UPDATE visita_prescripciones SET idDispensacion = @idDisp WHERE id = @id'
      );
      await rq().input('idVisita', sql.Int, idVisita).input('costo', sql.Decimal(10, 2), costoTotal).query(
        'UPDATE visitas_medicas SET costoFarmacia = costoFarmacia + @costo WHERE id = @idVisita'
      );

      let cargoComplementario = null;
      if (visita.estado === 'completada') {
        const deVisita = (await rq().input('idVisita', sql.Int, idVisita).query(
          "SELECT idFamiliar FROM cargos_servicio WHERE idVisita = @idVisita AND origen = 'visita'"
        )).recordset[0];
        const concepto = `Farmacia después del cierre de la visita #${idVisita}: ${cantidad} x ${medicamento}`;
        cargoComplementario = (await rq()
          .input('idPaciente', sql.Int, idPaciente)
          .input('concepto', sql.NVarChar(300), concepto)
          .input('monto', sql.Decimal(10, 2), costoTotal)
          .input('idVisita', sql.Int, idVisita)
          .input('idDispensacion', sql.Int, disp.id)
          .input('idFamiliar', sql.Int, deVisita ? deVisita.idFamiliar : null)
          .query(`
            INSERT INTO cargos_servicio (idPaciente, concepto, monto, estado, idVisita, idDispensacion, idFamiliar, origen)
            OUTPUT INSERTED.id, INSERTED.monto
            VALUES (@idPaciente, @concepto, @monto, 'pendiente', @idVisita, @idDispensacion, @idFamiliar, 'dispensacion')
          `)).recordset[0];
        await rq()
          .input('idCargo', sql.Int, cargoComplementario.id)
          .input('descripcion', sql.NVarChar(300), `${cantidad} x ${medicamento}`)
          .input('idReferencia', sql.Int, disp.id)
          .input('montoBase', sql.Decimal(10, 2), montoBase)
          .input('descuento', sql.Decimal(10, 2), Math.round((montoBase - costoTotal) * 100) / 100)
          .input('monto', sql.Decimal(10, 2), costoTotal)
          .query(`
            INSERT INTO cargos_detalle (idCargo, rubro, descripcion, idReferencia, montoBase, descuento, monto)
            VALUES (@idCargo, 'farmacia', @descripcion, @idReferencia, @montoBase, @descuento, @monto)
          `);
      }

      await tx.commit();
      return {
        dispensacion: new Dispensacion(disp),
        estadoPrescripcion: estadoRx.estado,
        cantidadPrescrita: estadoRx.cantidadPrescrita,
        cantidadEntregada: estadoRx.cantidadEntregada,
        cargoComplementario
      };
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }

  async obtenerPorId(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dispensaciones WHERE id = @id');
    return result.recordset[0] ? new Dispensacion(result.recordset[0]) : null;
  }

  async obtenerPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM dispensaciones WHERE idPaciente = @idPaciente ORDER BY fecha DESC');
    return result.recordset.map(f => new Dispensacion(f));
  }
}

module.exports = DispensacionRepository;
