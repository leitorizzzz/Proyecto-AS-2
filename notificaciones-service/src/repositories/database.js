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
      estado NVARCHAR(30) NOT NULL DEFAULT 'pendiente',
      intentos INT NOT NULL DEFAULT 0,
      maxIntentos INT NOT NULL DEFAULT 3,
      proximoIntento DATETIME2 NULL,
      fechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      fechaEnvio DATETIME2 NULL,
      fechaUltimoIntento DATETIME2 NULL,
      mensajeError NVARCHAR(500) NULL
    );
  `);

  // Evolucion de esquema: columnas de reintento. ALTERs idempotentes.
  const alters = [
    ['intentos',          "ALTER TABLE notificaciones ADD intentos INT NOT NULL CONSTRAINT DF_notif_intentos DEFAULT 0"],
    ['maxIntentos',       "ALTER TABLE notificaciones ADD maxIntentos INT NOT NULL CONSTRAINT DF_notif_max DEFAULT 3"],
    ['proximoIntento',    "ALTER TABLE notificaciones ADD proximoIntento DATETIME2 NULL"],
    ['fechaUltimoIntento',"ALTER TABLE notificaciones ADD fechaUltimoIntento DATETIME2 NULL"]
  ];
  for (const [col, ddl] of alters) {
    // eslint-disable-next-line no-await-in-loop
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('notificaciones') AND name = '${col}'
      ) ${ddl};
    `);
  }

  // La tabla previa tenia estado NVARCHAR(20) que no cabe 'fallida_definitiva'.
  // Ensanchar es idempotente (idempotencia por tipo final).
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('notificaciones')
        AND name = 'estado' AND max_length < 60
    )
    ALTER TABLE notificaciones ALTER COLUMN estado NVARCHAR(30) NOT NULL;
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
