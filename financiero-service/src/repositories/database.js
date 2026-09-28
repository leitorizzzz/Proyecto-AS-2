/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server y bootstrap de las tablas del dominio financiero:
 * cargos_servicio, cuotas_mensuales, donantes, donaciones,
 * gastos_operativos, pagos_fundacion.
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
      .catch(err => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

async function inicializarEsquema() {
  const pool = await getPool();

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cargos_servicio')
    CREATE TABLE cargos_servicio (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL,
      concepto NVARCHAR(300) NOT NULL,
      monto DECIMAL(10,2) NOT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      estado NVARCHAR(20) NOT NULL DEFAULT 'pendiente'
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cuotas_mensuales')
    CREATE TABLE cuotas_mensuales (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL,
      mes TINYINT NOT NULL,
      anio SMALLINT NOT NULL,
      monto DECIMAL(10,2) NOT NULL,
      estado NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
      fechaPago DATETIME2 NULL,
      CONSTRAINT UQ_cuotas_paciente_periodo UNIQUE (idPaciente, mes, anio)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'donantes')
    CREATE TABLE donantes (
      id INT IDENTITY(1,1) PRIMARY KEY,
      nombre NVARCHAR(200) NOT NULL,
      telefono NVARCHAR(30) NULL,
      email NVARCHAR(200) NULL,
      direccion NVARCHAR(300) NULL,
      fechaRegistro DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'donaciones')
    CREATE TABLE donaciones (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idDonante INT NOT NULL,
      monto DECIMAL(10,2) NOT NULL,
      tipo NVARCHAR(20) NOT NULL DEFAULT 'dinero',
      concepto NVARCHAR(500) NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_donaciones_donante FOREIGN KEY (idDonante) REFERENCES donantes(id)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'gastos_operativos')
    CREATE TABLE gastos_operativos (
      id INT IDENTITY(1,1) PRIMARY KEY,
      concepto NVARCHAR(300) NOT NULL,
      monto DECIMAL(10,2) NOT NULL,
      categoria NVARCHAR(50) NOT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pagos_fundacion')
    CREATE TABLE pagos_fundacion (
      id INT IDENTITY(1,1) PRIMARY KEY,
      monto DECIMAL(10,2) NOT NULL,
      concepto NVARCHAR(300) NOT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
