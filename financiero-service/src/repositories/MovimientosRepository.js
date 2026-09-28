const { sql, getPool } = require('./database');
const GastoOperativo = require('../models/GastoOperativo');
const PagoFundacion = require('../models/PagoFundacion');

class MovimientosRepository {

  async guardarGasto(gasto) {
    const pool = await getPool();
    const result = await pool.request()
      .input('concepto', sql.NVarChar(300), gasto.concepto)
      .input('monto', sql.Decimal(10, 2), gasto.monto)
      .input('categoria', sql.NVarChar(50), gasto.categoria)
      .query(`
        INSERT INTO gastos_operativos (concepto, monto, categoria)
        OUTPUT INSERTED.*
        VALUES (@concepto, @monto, @categoria)
      `);
    return new GastoOperativo(result.recordset[0]);
  }

  async listarGastos({ desde, hasta } = {}) {
    const pool = await getPool();
    if (desde && hasta) {
      const result = await pool.request()
        .input('desde', sql.DateTime2, new Date(desde))
        .input('hasta', sql.DateTime2, new Date(hasta))
        .query('SELECT * FROM gastos_operativos WHERE fecha BETWEEN @desde AND @hasta ORDER BY fecha DESC');
      return result.recordset.map(r => new GastoOperativo(r));
    }
    const result = await pool.request().query('SELECT * FROM gastos_operativos ORDER BY fecha DESC');
    return result.recordset.map(r => new GastoOperativo(r));
  }

  async guardarPagoFundacion(pago) {
    const pool = await getPool();
    const result = await pool.request()
      .input('monto', sql.Decimal(10, 2), pago.monto)
      .input('concepto', sql.NVarChar(300), pago.concepto)
      .query(`
        INSERT INTO pagos_fundacion (monto, concepto)
        OUTPUT INSERTED.*
        VALUES (@monto, @concepto)
      `);
    return new PagoFundacion(result.recordset[0]);
  }

  async listarPagosFundacion({ desde, hasta } = {}) {
    const pool = await getPool();
    if (desde && hasta) {
      const result = await pool.request()
        .input('desde', sql.DateTime2, new Date(desde))
        .input('hasta', sql.DateTime2, new Date(hasta))
        .query('SELECT * FROM pagos_fundacion WHERE fecha BETWEEN @desde AND @hasta ORDER BY fecha DESC');
      return result.recordset.map(r => new PagoFundacion(r));
    }
    const result = await pool.request().query('SELECT * FROM pagos_fundacion ORDER BY fecha DESC');
    return result.recordset.map(r => new PagoFundacion(r));
  }
}

module.exports = MovimientosRepository;
