/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server (BD compartida AsiloCabezaAlgodon) y bootstrap
 * de la tabla propia del servicio de Laboratorio: resultados_examenes.
 *
 * La tabla visita_examenes es propiedad de pacientes-service; laboratorio
 * la lee para saber que ordenes tiene pendientes y actualiza su estado
 * (a 'disponible') cuando registra un resultado. Al vivir en la misma
 * base de datos, esto es un JOIN normal, no una llamada HTTP.
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
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resultados_examenes')
    CREATE TABLE resultados_examenes (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idExamen INT NOT NULL UNIQUE,
      tipoResultado NVARCHAR(20) NOT NULL,
      valorTexto NVARCHAR(MAX) NULL,
      valorNumerico DECIMAL(18,4) NULL,
      archivoAdjunto NVARCHAR(500) NULL,
      estado NVARCHAR(20) NOT NULL DEFAULT 'registrado',
      fechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      fechaDisponible DATETIME2 NULL
    );
  `);

  // Precio por tipo de examen. Sencillo hoy; en el futuro deberia ser
  // gestionable desde el frontend.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'examenes_precios')
    CREATE TABLE examenes_precios (
      id INT IDENTITY(1,1) PRIMARY KEY,
      tipo NVARCHAR(200) NOT NULL UNIQUE,
      precioBase DECIMAL(10,2) NOT NULL
    );
  `);

  // Semilla de precios base
  const count = await pool.request().query('SELECT COUNT(*) AS total FROM examenes_precios');
  if (count.recordset[0].total === 0) {
    await pool.request().query(`
      INSERT INTO examenes_precios (tipo, precioBase) VALUES
        ('Hematologia completa', 85.00),
        ('Quimica sanguinea', 120.00),
        ('Electrocardiograma de 12 derivaciones', 200.00),
        ('Perfil lipidico', 90.00),
        ('Radiografia de torax', 175.00),
        ('Uroanalisis', 60.00);
    `);
  }
}

module.exports = { sql, getPool, inicializarEsquema };
