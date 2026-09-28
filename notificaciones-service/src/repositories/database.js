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
      .catch(err => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

async function inicializarEsquema() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'notificaciones')
    CREATE TABLE notificaciones (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NULL,
      tipoEvento NVARCHAR(50) NOT NULL,
      destinatarioEmail NVARCHAR(200) NOT NULL,
      asunto NVARCHAR(300) NOT NULL,
      cuerpo NVARCHAR(MAX) NOT NULL,
      estado NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
      fechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      fechaEnvio DATETIME2 NULL,
      mensajeError NVARCHAR(500) NULL
    );
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
