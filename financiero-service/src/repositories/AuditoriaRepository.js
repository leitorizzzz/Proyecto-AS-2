const { sql, getPool } = require('./database');
const RegistroAuditoria = require('../models/RegistroAuditoria');

/**
 * CAPA DE ACCESO A DATOS
 * Escritura en la tabla compartida `auditoria`. Copia identica en auth,
 * pacientes, farmacia y financiero; cada uno la crea al arrancar si no
 * existe (ver crearTablaAuditoria).
 */
class AuditoriaRepository {
  async guardar(registro) {
    const pool = await getPool();
    const result = await pool.request()
      .input('usuario', sql.NVarChar(200), registro.usuario)
      .input('idUsuario', sql.Int, registro.idUsuario)
      .input('accion', sql.NVarChar(30), registro.accion)
      .input('entidad', sql.NVarChar(50), registro.entidad)
      .input('idEntidad', sql.Int, registro.idEntidad)
      .input('detalle', sql.NVarChar(300), registro.detalle)
      .input('ip', sql.NVarChar(64), registro.ip)
      .input('modulo', sql.NVarChar(30), registro.modulo)
      .input('datosAnteriores', sql.NVarChar(sql.MAX), registro.datosAnterioresJson())
      .input('datosNuevos', sql.NVarChar(sql.MAX), registro.datosNuevosJson())
      .query(`
        INSERT INTO auditoria (usuario, idUsuario, accion, entidad, idEntidad, detalle,
                               ip, modulo, datosAnteriores, datosNuevos)
        OUTPUT INSERTED.*
        VALUES (@usuario, @idUsuario, @accion, @entidad, @idEntidad, @detalle,
                @ip, @modulo, @datosAnteriores, @datosNuevos)
      `);
    return new RegistroAuditoria(result.recordset[0]);
  }
}

/**
 * DDL idempotente de `auditoria`. Varios servicios arrancan a la vez, asi
 * que se toleran los errores de "ya existe" (2714 tabla, 1913 indice) que
 * produce la carrera entre el IF NOT EXISTS y el CREATE.
 */
async function crearTablaAuditoria(pool) {
  const tolerar = async q => {
    try { await pool.request().query(q); }
    catch (err) { if (![2714, 1913].includes(err.number)) throw err; }
  };
  await tolerar(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'auditoria')
    CREATE TABLE auditoria (
      id INT IDENTITY(1,1) PRIMARY KEY,
      usuario NVARCHAR(200) NOT NULL,
      idUsuario INT NULL,
      accion NVARCHAR(30) NOT NULL,
      entidad NVARCHAR(50) NOT NULL,
      idEntidad INT NULL,
      detalle NVARCHAR(300) NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
  // Caso 24: IP, modulo y datos anteriores / nuevos en JSON. 2705 = la
  // columna ya existe (otro servicio la agrego en la misma carrera).
  for (const [col, tipo] of [['ip', 'NVARCHAR(64) NULL'], ['modulo', 'NVARCHAR(30) NULL'],
                             ['datosAnteriores', 'NVARCHAR(MAX) NULL'], ['datosNuevos', 'NVARCHAR(MAX) NULL']]) {
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auditoria') AND name = '${col}')
        ALTER TABLE auditoria ADD ${col} ${tipo};
      `);
    } catch (err) { if (err.number !== 2705) throw err; }
  }
  await tolerar(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_auditoria_fecha')
    CREATE INDEX IX_auditoria_fecha ON auditoria (fecha DESC, entidad);
  `);
}

module.exports = AuditoriaRepository;
module.exports.crearTablaAuditoria = crearTablaAuditoria;
