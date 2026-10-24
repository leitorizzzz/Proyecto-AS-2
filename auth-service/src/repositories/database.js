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

  // Desactivacion de cuentas (borrado logico): las existentes quedan activas.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('usuarios') AND name = 'activo'
    )
    ALTER TABLE usuarios ADD activo BIT NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT 1;
  `);
  // Recuperacion de contrasena (RF-42): solo el hash SHA-256 del token.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tokens_recuperacion')
    CREATE TABLE tokens_recuperacion (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idUsuario INT NOT NULL,
      tokenHash CHAR(64) NOT NULL,
      expira DATETIME2 NOT NULL,
      usado DATETIME2 NULL,
      fechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_tokens_recuperacion_usuario FOREIGN KEY (idUsuario) REFERENCES usuarios(id),
      CONSTRAINT UQ_tokens_recuperacion_hash UNIQUE (tokenHash)
    );
  `);

  // Tabla compartida de auditoria (idempotente; ver AuditoriaRepository).
  // require diferido: AuditoriaRepository depende de este modulo.
  await require('./AuditoriaRepository').crearTablaAuditoria(pool);
}

module.exports = { sql, getPool, inicializarEsquema };
