const { sql, getPool } = require('./database');
const CargoServicio = require('../models/CargoServicio');
const CuotaMensual = require('../models/CuotaMensual');
const AbonoCargo = require('../models/AbonoCargo');

/**
 * Repositorio de la cuenta corriente de un paciente: cargos por servicio
 * y cuotas mensuales. Es el core del estado de cuenta.
 */
class CuentaRepository {

  // --- Cargos ---

  async guardarCargo(cargo) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, cargo.idPaciente)
      .input('concepto', sql.NVarChar(300), cargo.concepto)
      .input('monto', sql.Decimal(10, 2), cargo.monto)
      .input('estado', sql.NVarChar(20), cargo.estado)
      .input('idFamiliar', sql.Int, cargo.idFamiliar)
      .query(`
        INSERT INTO cargos_servicio (idPaciente, concepto, monto, estado, idFamiliar, origen)
        OUTPUT INSERTED.*
        VALUES (@idPaciente, @concepto, @monto, @estado, @idFamiliar, 'manual')
      `);
    return new CargoServicio(result.recordset[0]);
  }

  async listarCargosPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM cargos_servicio WHERE idPaciente = @idPaciente ORDER BY fecha DESC');
    const detalles = (await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query(`
        SELECT cd.* FROM cargos_detalle cd
        INNER JOIN cargos_servicio c ON c.id = cd.idCargo
        WHERE c.idPaciente = @idPaciente
        ORDER BY cd.id
      `)).recordset;
    return result.recordset.map(r => new CargoServicio({
      ...r, detalles: detalles.filter(d => d.idCargo === r.id).map(d => ({
        rubro: d.rubro, descripcion: d.descripcion, idReferencia: d.idReferencia,
        montoBase: Number(d.montoBase), descuento: Number(d.descuento), monto: Number(d.monto)
      }))
    }));
  }

  async obtenerCargo(id) {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id)
      .query('SELECT * FROM cargos_servicio WHERE id = @id');
    return r.recordset[0] ? new CargoServicio(r.recordset[0]) : null;
  }

  /**
   * Abono a un cargo en una transaccion: bloquea el cargo, sube montoPagado
   * solo si no supera el monto (UPDATE condicionado) y registra el abono.
   * Devuelve null si el abono dejaria el saldo negativo.
   */
  async registrarAbono(idCargo, { monto, concepto, idUsuario }) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const rq = () => new sql.Request(tx);
    try {
      const up = await rq().input('id', sql.Int, idCargo).input('monto', sql.Decimal(10, 2), monto).query(`
        UPDATE cargos_servicio WITH (UPDLOCK, ROWLOCK)
        SET montoPagado = montoPagado + @monto,
            estado = CASE WHEN montoPagado + @monto >= monto THEN 'pagado' ELSE 'parcial' END
        OUTPUT INSERTED.*
        WHERE id = @id AND estado <> 'pagado' AND montoPagado + @monto <= monto
      `);
      if (up.rowsAffected[0] !== 1) { await tx.rollback(); return null; }
      const abono = (await rq()
        .input('idCargo', sql.Int, idCargo)
        .input('monto', sql.Decimal(10, 2), monto)
        .input('concepto', sql.NVarChar(300), concepto || null)
        .input('idUsuario', sql.Int, idUsuario ?? null)
        .query(`INSERT INTO abonos_cargo (idCargo, monto, concepto, idUsuario)
                OUTPUT INSERTED.* VALUES (@idCargo, @monto, @concepto, @idUsuario)`)).recordset[0];
      await tx.commit();
      return { cargo: new CargoServicio(up.recordset[0]), abono: new AbonoCargo(abono) };
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  }

  async saldoPendientePorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN estado = 'pagado' THEN 0 ELSE monto - montoPagado END), 0) AS saldoCargos
        FROM cargos_servicio WHERE idPaciente = @idPaciente
      `);
    return Number(result.recordset[0].saldoCargos);
  }

  // --- Cuotas ---

  async guardarCuota(cuota) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, cuota.idPaciente)
      .input('mes', sql.TinyInt, cuota.mes)
      .input('anio', sql.SmallInt, cuota.anio)
      .input('monto', sql.Decimal(10, 2), cuota.monto)
      .input('estado', sql.NVarChar(20), cuota.estado)
      .input('fechaVencimiento', sql.Date, cuota.fechaVencimiento)
      .query(`
        INSERT INTO cuotas_mensuales (idPaciente, mes, anio, monto, estado, fechaVencimiento)
        OUTPUT INSERTED.*
        VALUES (@idPaciente, @mes, @anio, @monto, @estado, @fechaVencimiento)
      `);
    return new CuotaMensual(result.recordset[0]);
  }

  /**
   * Caso 21: cuentas con algo por cobrar (saldo de cargos o cuotas
   * pendientes), con el nombre del paciente (tabla pacientes, BD compartida)
   * y sus cuotas pendientes para calcular la mora.
   */
  async cuentasPorCobrar() {
    const pool = await getPool();
    const [cuentas, cuotas] = await Promise.all([
      pool.request().query(`
        SELECT p.id AS idPaciente, p.nombres, p.apellidos, p.activo,
               ISNULL(c.saldo, 0) AS saldoCargos, ISNULL(q.saldo, 0) AS saldoCuotas
        FROM pacientes p
        LEFT JOIN (SELECT idPaciente,
                          SUM(CASE WHEN estado = 'pagado' THEN 0 ELSE monto - montoPagado END) AS saldo
                   FROM cargos_servicio GROUP BY idPaciente) c ON c.idPaciente = p.id
        LEFT JOIN (SELECT idPaciente, SUM(monto) AS saldo
                   FROM cuotas_mensuales WHERE estado = 'pendiente' GROUP BY idPaciente) q ON q.idPaciente = p.id
        WHERE ISNULL(c.saldo, 0) > 0 OR ISNULL(q.saldo, 0) > 0
      `),
      pool.request().query(`SELECT * FROM cuotas_mensuales WHERE estado = 'pendiente'`)
    ]);
    const pendientes = cuotas.recordset.map(r => new CuotaMensual(r));
    return cuentas.recordset.map(r => ({
      idPaciente: r.idPaciente,
      paciente: `${r.nombres} ${r.apellidos}`,
      activo: r.activo !== false,
      saldoCargos: Number(r.saldoCargos),
      saldoCuotas: Number(r.saldoCuotas),
      cuotas: pendientes.filter(q => q.idPaciente === r.idPaciente)
    }));
  }

  async obtenerCuota(idPaciente, mes, anio) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .input('mes', sql.TinyInt, mes)
      .input('anio', sql.SmallInt, anio)
      .query('SELECT * FROM cuotas_mensuales WHERE idPaciente=@idPaciente AND mes=@mes AND anio=@anio');
    return result.recordset[0] ? new CuotaMensual(result.recordset[0]) : null;
  }

  async pagarCuota(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE cuotas_mensuales
        SET estado='pagada', fechaPago = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    return result.recordset[0] ? new CuotaMensual(result.recordset[0]) : null;
  }

  async cuotasPorPaciente(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query('SELECT * FROM cuotas_mensuales WHERE idPaciente=@idPaciente ORDER BY anio DESC, mes DESC');
    return result.recordset.map(r => new CuotaMensual(r));
  }

  async saldoCuotasPendientes(idPaciente) {
    const pool = await getPool();
    const result = await pool.request()
      .input('idPaciente', sql.Int, idPaciente)
      .query(`
        SELECT ISNULL(SUM(monto),0) AS saldo
        FROM cuotas_mensuales
        WHERE idPaciente=@idPaciente AND estado='pendiente'
      `);
    return Number(result.recordset[0].saldo);
  }

  // --- Ingresos por rango de fecha (para reportes) ---
  async cuotasCobradasEnRango(desde, hasta) {
    const pool = await getPool();
    const result = await pool.request()
      .input('desde', sql.DateTime2, new Date(desde))
      .input('hasta', sql.DateTime2, new Date(hasta))
      .query(`
        SELECT * FROM cuotas_mensuales
        WHERE estado='pagada' AND fechaPago BETWEEN @desde AND @hasta
        ORDER BY fechaPago DESC
      `);
    return result.recordset.map(r => new CuotaMensual(r));
  }
}

module.exports = CuentaRepository;
