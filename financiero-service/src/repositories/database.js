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

  // Borrado logico de donantes: las donaciones registradas se conservan.
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('donantes') AND name = 'activo'
    )
    ALTER TABLE donantes ADD activo BIT NOT NULL CONSTRAINT DF_donantes_activo DEFAULT 1;
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
  // --- Cargo automatico al cerrar la visita (caso 19) -------------------
  // Columnas nuevas de cargos_servicio, idempotentes. origen distingue el
  // cargo manual del generado por una visita o por una dispensacion
  // posterior al cierre; montoPagado lleva los abonos (saldo = monto -
  // montoPagado, nunca negativo por el CHECK).
  const columnasCargo = [
    ['idVisita', 'INT NULL'],
    ['idDispensacion', 'INT NULL'],
    ['idFamiliar', 'INT NULL'],
    ['origen', "NVARCHAR(20) NOT NULL CONSTRAINT DF_cargos_origen DEFAULT 'manual'"],
    ['montoPagado', 'DECIMAL(10,2) NOT NULL CONSTRAINT DF_cargos_pagado DEFAULT 0']
  ];
  for (const [col, tipo] of columnasCargo) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns
                     WHERE object_id = OBJECT_ID('cargos_servicio') AND name = '${col}')
      ALTER TABLE cargos_servicio ADD ${col} ${tipo};
    `);
  }
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_cargos_saldo_no_negativo')
    ALTER TABLE cargos_servicio ADD CONSTRAINT CK_cargos_saldo_no_negativo
      CHECK (monto > 0 AND montoPagado >= 0 AND montoPagado <= monto);
  `);
  // Un solo cargo por visita y uno por dispensacion posterior al cierre:
  // reintentar el cierre no puede duplicar el cobro.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_cargos_visita')
    CREATE UNIQUE INDEX UX_cargos_visita ON cargos_servicio (idVisita)
      WHERE idVisita IS NOT NULL AND idDispensacion IS NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_cargos_dispensacion')
    CREATE UNIQUE INDEX UX_cargos_dispensacion ON cargos_servicio (idDispensacion)
      WHERE idDispensacion IS NOT NULL;
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cargos_detalle')
    CREATE TABLE cargos_detalle (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idCargo INT NOT NULL,
      rubro NVARCHAR(20) NOT NULL,
      descripcion NVARCHAR(300) NOT NULL,
      idReferencia INT NULL,
      montoBase DECIMAL(10,2) NOT NULL,
      descuento DECIMAL(10,2) NOT NULL,
      monto DECIMAL(10,2) NOT NULL,
      CONSTRAINT FK_cargos_detalle_cargo FOREIGN KEY (idCargo) REFERENCES cargos_servicio(id),
      CONSTRAINT CK_cargos_detalle_rubro CHECK (rubro IN ('consulta', 'laboratorio', 'farmacia')),
      CONSTRAINT CK_cargos_detalle_montos CHECK (montoBase >= 0 AND descuento >= 0 AND monto >= 0)
    );
  `);

  // Abonos a cargos (caso 20). La suma nunca supera el monto del cargo.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'abonos_cargo')
    CREATE TABLE abonos_cargo (
      id INT IDENTITY(1,1) PRIMARY KEY,
      idCargo INT NOT NULL,
      monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
      concepto NVARCHAR(300) NULL,
      idUsuario INT NULL,
      fecha DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_abonos_cargo FOREIGN KEY (idCargo) REFERENCES cargos_servicio(id)
    );
  `);

  // Tarifas de servicios propios del cargo de visita (consulta del
  // especialista). El precio de laboratorio y farmacia sale de sus catalogos.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tarifas_servicio')
    CREATE TABLE tarifas_servicio (
      id INT IDENTITY(1,1) PRIMARY KEY,
      codigo NVARCHAR(50) NOT NULL UNIQUE,
      descripcion NVARCHAR(200) NOT NULL,
      precioBase DECIMAL(10,2) NOT NULL CHECK (precioBase > 0)
    );
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM tarifas_servicio WHERE codigo = 'consulta_especialista')
    INSERT INTO tarifas_servicio (codigo, descripcion, precioBase)
    VALUES ('consulta_especialista', N'Consulta con médico especialista de la fundación', 150.00);
  `);

  // Caso 21: vencimiento de la cuota. Las existentes vencen el ultimo dia
  // de su mes (mismo criterio que alertasCobro.vencimientoPorDefecto).
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns
                   WHERE object_id = OBJECT_ID('cuotas_mensuales') AND name = 'fechaVencimiento')
    ALTER TABLE cuotas_mensuales ADD fechaVencimiento DATE NULL;
  `);
  await pool.request().query(`
    UPDATE cuotas_mensuales SET fechaVencimiento = EOMONTH(DATEFROMPARTS(anio, mes, 1))
    WHERE fechaVencimiento IS NULL;
  `);

  // Tabla compartida de auditoria (idempotente; ver AuditoriaRepository).
  // require diferido: AuditoriaRepository depende de este modulo.
  await require('./AuditoriaRepository').crearTablaAuditoria(pool);
}

module.exports = { sql, getPool, inicializarEsquema };
