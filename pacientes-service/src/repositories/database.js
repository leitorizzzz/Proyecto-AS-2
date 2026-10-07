/**
 * CAPA DE ACCESO A DATOS
 * Conexion a SQL Server (BD compartida AsiloCabezaAlgodon) y bootstrap
 * de las tablas propias del servicio de pacientes:
 *   - pacientes
 *   - solicitudes_referencia
 *   - visitas_medicas
 *   - visita_examenes
 *   - visita_prescripciones
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
      familiarEmail NVARCHAR(200) NULL,
      padecimientos NVARCHAR(MAX) NULL,
      fechaIngreso DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  // Evolucion de esquema: agregar familiarEmail a tablas ya creadas
  // sin dropear datos. Idempotente.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('pacientes') AND name = 'familiarEmail'
    )
    ALTER TABLE pacientes ADD familiarEmail NVARCHAR(200) NULL;
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'solicitudes_referencia')
    CREATE TABLE solicitudes_referencia (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL,
      idMedicoGeneral INT NOT NULL,
      especialidad NVARCHAR(100) NOT NULL,
      motivo NVARCHAR(1000) NOT NULL,
      estado NVARCHAR(30) NOT NULL DEFAULT 'pendiente_asignacion',
      fechaCita DATE NULL,
      horaCita TIME NULL,
      idMedicoEspecialista INT NULL,
      fechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      fechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_solicitudes_paciente
        FOREIGN KEY (idPaciente) REFERENCES pacientes(id)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_solicitudes_paciente_especialidad_activa'
    )
    CREATE INDEX IX_solicitudes_paciente_especialidad_activa
      ON solicitudes_referencia (idPaciente, especialidad, estado);
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'visitas_medicas')
    CREATE TABLE visitas_medicas (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idSolicitudReferencia INT NOT NULL UNIQUE,
      idPaciente INT NOT NULL,
      idMedicoEspecialista INT NOT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      diagnostico NVARCHAR(MAX) NULL,
      observaciones NVARCHAR(MAX) NULL,
      estado NVARCHAR(30) NOT NULL DEFAULT 'en_atencion',
      fechaCompletada DATETIME2 NULL,
      CONSTRAINT FK_visitas_solicitud
        FOREIGN KEY (idSolicitudReferencia) REFERENCES solicitudes_referencia(id),
      CONSTRAINT FK_visitas_paciente
        FOREIGN KEY (idPaciente) REFERENCES pacientes(id)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'visita_examenes')
    CREATE TABLE visita_examenes (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idVisita INT NOT NULL,
      tipo NVARCHAR(200) NOT NULL,
      estado NVARCHAR(30) NOT NULL DEFAULT 'pendiente',
      fechaSolicitud DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_examenes_visita
        FOREIGN KEY (idVisita) REFERENCES visitas_medicas(id)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'visita_prescripciones')
    CREATE TABLE visita_prescripciones (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idVisita INT NOT NULL,
      medicamento NVARCHAR(200) NOT NULL,
      dosis NVARCHAR(200) NULL,
      indicaciones NVARCHAR(500) NULL,
      idMedicamento INT NULL,
      estado NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
      idDispensacion INT NULL,
      fechaDispensacion DATETIME2 NULL,
      fechaPrescripcion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_prescripciones_visita
        FOREIGN KEY (idVisita) REFERENCES visitas_medicas(id)
    );
  `);

  // RN-06: la prescripcion debe tener identidad y estado para que
  // farmacia-service pueda validar antes de dispensar. ALTERs idempotentes
  // para no romper BDs ya desplegadas.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('visita_prescripciones') AND name = 'idMedicamento'
    )
    ALTER TABLE visita_prescripciones ADD idMedicamento INT NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('visita_prescripciones') AND name = 'estado'
    )
    ALTER TABLE visita_prescripciones ADD estado NVARCHAR(20) NOT NULL
      CONSTRAINT DF_visita_prescripciones_estado DEFAULT 'pendiente';
  `);
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('visita_prescripciones') AND name = 'idDispensacion'
    )
    ALTER TABLE visita_prescripciones ADD idDispensacion INT NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('visita_prescripciones') AND name = 'fechaDispensacion'
    )
    ALTER TABLE visita_prescripciones ADD fechaDispensacion DATETIME2 NULL;
  `);
}

module.exports = { sql, getPool, inicializarEsquema };
