/**
 * CAPA DE ACCESO A DATOS
 * Configuracion de la base de datos SQLite.
 * (En produccion se usaria MySQL/SQL Server/Oracle como en el resto
 *  del proyecto; SQLite se usa aqui por simplicidad para el demo
 *  del microservicio dentro de un contenedor Docker).
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'farmacia.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS medicamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    presentacion TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    precioUnitario REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dispensaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idPaciente INTEGER NOT NULL,
    idVisita INTEGER,
    idMedicamento INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    costoTotal REAL NOT NULL,
    fecha TEXT NOT NULL,
    FOREIGN KEY (idMedicamento) REFERENCES medicamentos(id)
  );
`);

// Datos semilla para poder probar el microservicio de inmediato
const count = db.prepare('SELECT COUNT(*) AS total FROM medicamentos').get().total;
if (count === 0) {
  const insertar = db.prepare(
    'INSERT INTO medicamentos (nombre, presentacion, stock, precioUnitario) VALUES (?, ?, ?, ?)'
  );
  insertar.run('Paracetamol', 'tableta 500mg', 200, 0.75);
  insertar.run('Losartan', 'tableta 50mg', 150, 1.20);
  insertar.run('Amoxicilina', 'suspension 250mg/5ml', 40, 3.50);
}

module.exports = db;
