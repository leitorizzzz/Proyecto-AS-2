/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server (BD compartida AsiloCabezaAlgodon) y bootstrap
 * de la tabla de usuarios.
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
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'usuarios')
    CREATE TABLE usuarios (
      id INT IDENTITY(1,1) PRIMARY KEY,
      nombre NVARCHAR(200) NOT NULL,
      email NVARCHAR(200) NOT NULL UNIQUE,
      passwordHash NVARCHAR(255) NOT NULL,
      rol NVARCHAR(50) NOT NULL,
      fechaRegistro DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
