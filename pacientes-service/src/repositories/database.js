/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server (BD compartida AsiloCabezaAlgodon) y bootstrap
 * de la tabla propia de Pacientes.
 */
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .catch(err => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

async function inicializarEsquema() {
  const pool = await getPool();

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pacientes')
    CREATE TABLE pacientes (
      id INT IDENTITY(1,1) PRIMARY KEY,
      nombres NVARCHAR(200) NOT NULL,
      apellidos NVARCHAR(200) NOT NULL,
      fechaNacimiento DATE NOT NULL,
      genero NVARCHAR(20) NOT NULL,
      dpi NVARCHAR(20) NOT NULL UNIQUE,
      direccion NVARCHAR(300) NULL,
      telefono NVARCHAR(30) NULL,
      contactoEmergencia NVARCHAR(200) NULL,
      padecimientos NVARCHAR(MAX) NULL,
      fechaIngreso DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
