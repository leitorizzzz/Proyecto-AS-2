/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server (BD compartida AsiloCabezaAlgodon) y bootstrap
 * de las tablas propias de Farmacia: medicamentos y dispensaciones.
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
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'medicamentos')
    CREATE TABLE medicamentos (
      id INT IDENTITY(1,1) PRIMARY KEY,
      nombre NVARCHAR(200) NOT NULL,
      presentacion NVARCHAR(200) NULL,
      stock INT NOT NULL DEFAULT 0,
      precioUnitario DECIMAL(10,2) NOT NULL
    );
  `);

  // Despacho parcial (caso 18): cada dispensacion apunta a su prescripcion
  // y guarda el precio base (antes del descuento) para el desglose del cargo.
  for (const [col, tipo] of [['idPrescripcion', 'INT NULL'], ['montoBase', 'DECIMAL(10,2) NULL']]) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns
                     WHERE object_id = OBJECT_ID('dispensaciones') AND name = '${col}')
      ALTER TABLE dispensaciones ADD ${col} ${tipo};
    `);
  }

  // Borrado logico: un medicamento desactivado sale del inventario visible
  // pero sus dispensaciones siguen apuntando a el. Existentes = activos.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('medicamentos') AND name = 'activo'
    )
    ALTER TABLE medicamentos ADD activo BIT NOT NULL CONSTRAINT DF_medicamentos_activo DEFAULT 1;
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dispensaciones')
    CREATE TABLE dispensaciones (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL,
      idVisita INT NULL,
      idMedicamento INT NOT NULL,
      cantidad INT NOT NULL,
      costoTotal DECIMAL(10,2) NOT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_dispensaciones_medicamento
        FOREIGN KEY (idMedicamento) REFERENCES medicamentos(id)
    );
  `);

  const result = await pool.request().query('SELECT COUNT(*) AS total FROM medicamentos');
  if (result.recordset[0].total === 0) {
    await pool.request().query(`
      INSERT INTO medicamentos (nombre, presentacion, stock, precioUnitario) VALUES
        ('Paracetamol', 'tableta 500mg', 200, 0.75),
        ('Losartan', 'tableta 50mg', 150, 1.20),
        ('Amoxicilina', 'suspension 250mg/5ml', 40, 3.50);
    `);
  }
  // Tabla compartida de auditoria (idempotente; ver AuditoriaRepository).
  // require diferido: AuditoriaRepository depende de este modulo.
  await require('./AuditoriaRepository').crearTablaAuditoria(pool);
}

module.exports = { sql, getPool, inicializarEsquema };
