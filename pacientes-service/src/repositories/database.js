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

  // Borrado logico: las filas existentes quedan activas (DEFAULT 1).
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('pacientes') AND name = 'activo'
    )
    ALTER TABLE pacientes ADD activo BIT NOT NULL CONSTRAINT DF_pacientes_activo DEFAULT 1;
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

  // Despacho parcial (caso 18): cantidad prescrita y entregada. Estados de
  // la prescripcion: pendiente -> parcial -> dispensada. Las prescripciones
  // anteriores quedan con cantidadPrescrita NULL (se despachan completas).
  const columnas = [
    ['visita_prescripciones', 'cantidadPrescrita', 'INT NULL'],
    ['visita_prescripciones', 'cantidadEntregada', 'INT NOT NULL CONSTRAINT DF_vp_entregada DEFAULT 0'],
    // Costo preferencial acumulado en la visita (laboratorio al ordenar,
    // farmacia al despachar). Lo suman los servicios dentro de su transaccion.
    ['visitas_medicas', 'costoLaboratorio', 'DECIMAL(10,2) NOT NULL CONSTRAINT DF_vm_costo_lab DEFAULT 0'],
    ['visitas_medicas', 'costoFarmacia', 'DECIMAL(10,2) NOT NULL CONSTRAINT DF_vm_costo_far DEFAULT 0']
  ];
  for (const [tabla, col, tipo] of columnas) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns
                     WHERE object_id = OBJECT_ID('${tabla}') AND name = '${col}')
      ALTER TABLE ${tabla} ADD ${col} ${tipo};
    `);
  }
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_vp_cantidades')
    ALTER TABLE visita_prescripciones ADD CONSTRAINT CK_vp_cantidades
      CHECK (cantidadEntregada >= 0 AND (cantidadPrescrita IS NULL
             OR (cantidadPrescrita > 0 AND cantidadEntregada <= cantidadPrescrita)));
  `);
  // --- Caso 15: costo del examen registrado al ordenarlo (RN-09) ---------
  // Se congela el precio del catalogo y el descuento vigentes al pedirlo;
  // cambiar el catalogo despues no altera lo ya ordenado. Las ordenes
  // anteriores a esta columna quedan en NULL y se cobran con el catalogo.
  for (const col of ['precioBase', 'descuento', 'costo']) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('visita_examenes') AND name = '${col}')
      ALTER TABLE visita_examenes ADD ${col} DECIMAL(10,2) NULL;
    `);
  }

  // --- Caso 5: familiar responsable y ficha medica 1:1 -------------------
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'familiares')
    CREATE TABLE familiares (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL,
      nombres NVARCHAR(200) NOT NULL,
      apellidos NVARCHAR(200) NOT NULL,
      dpi NVARCHAR(13) NOT NULL,
      parentesco NVARCHAR(50) NOT NULL,
      telefono NVARCHAR(30) NOT NULL,
      email NVARCHAR(200) NOT NULL,
      direccion NVARCHAR(300) NOT NULL,
      principal BIT NOT NULL CONSTRAINT DF_familiares_principal DEFAULT 1,
      activo BIT NOT NULL CONSTRAINT DF_familiares_activo DEFAULT 1,
      fechaRegistro DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_familiares_paciente FOREIGN KEY (idPaciente) REFERENCES pacientes(id)
    );
  `);
  // Un solo familiar principal activo por paciente.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_familiar_principal')
    CREATE UNIQUE INDEX UX_familiar_principal ON familiares (idPaciente)
      WHERE principal = 1 AND activo = 1;
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fichas_medicas')
    CREATE TABLE fichas_medicas (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idPaciente INT NOT NULL UNIQUE,
      grupoSanguineo NVARCHAR(5) NULL,
      alergias NVARCHAR(MAX) NULL,
      antecedentes NVARCHAR(MAX) NULL,
      fechaApertura DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_fichas_paciente FOREIGN KEY (idPaciente) REFERENCES pacientes(id)
    );
  `);

  // --- Caso 7: enfermero asignado; caso 13: visita vinculada a la ficha ---
  for (const [tabla, col, tipo] of [['solicitudes_referencia', 'idEnfermero', 'INT NULL'],
                                    ['visitas_medicas', 'idFichaMedica', 'INT NULL']]) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('${tabla}') AND name = '${col}')
      ALTER TABLE ${tabla} ADD ${col} ${tipo};
    `);
  }

  // --- Caso 12: notificaciones internas para el personal ----------------
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'avisos')
    CREATE TABLE avisos (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idUsuario INT NOT NULL,
      tipo NVARCHAR(30) NOT NULL,
      mensaje NVARCHAR(500) NOT NULL,
      idSolicitud INT NULL,
      leido BIT NOT NULL CONSTRAINT DF_avisos_leido DEFAULT 0,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_avisos_usuario')
    CREATE INDEX IX_avisos_usuario ON avisos (idUsuario, leido, fecha DESC);
  `);

  // Tabla compartida de auditoria (idempotente; ver AuditoriaRepository).
  // require diferido: AuditoriaRepository depende de este modulo.
  await require('./AuditoriaRepository').crearTablaAuditoria(pool);
}

module.exports = { sql, getPool, inicializarEsquema };
