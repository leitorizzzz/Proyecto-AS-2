require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { getPool } = require('./repositories/database');
const ReportesRepository = require('./repositories/ReportesRepository');
const ReportesService = require('./services/ReportesService');
const ReportesController = require('./controllers/ReportesController');
const crearRutasReportes = require('./routes/reportesRoutes');
const AuditoriaRepository = require('./repositories/AuditoriaRepository');
const AuditoriaService = require('./services/AuditoriaService');
const AuditoriaController = require('./controllers/AuditoriaController');
const crearRutasAuditoria = require('./routes/auditoriaRoutes');
const { ocultarErrores500, manejadorErrores } = require('./middleware/manejoErrores');
const VistasAnalisisRepository = require('./repositories/VistasAnalisisRepository');

const repo = new ReportesRepository();
const service = new ReportesService(repo);
const controller = new ReportesController(service);

// Bitacora de auditoria: la escriben otros servicios, reportes solo la lee.
const auditoriaController = new AuditoriaController(new AuditoriaService(new AuditoriaRepository()));

const app = express();
app.use(cors());
app.use(express.json());
app.use(ocultarErrores500);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'reportes-service' });
});

app.use('/api/reportes', crearRutasReportes(controller));
app.use('/api/auditoria', crearRutasAuditoria(auditoriaController));
// JSON malformado y errores no atrapados: respuesta JSON, sin traza.
app.use(manejadorErrores);

const PORT = process.env.PORT || 3005;

// reportes-service no crea tablas propias; solo verifica que puede
// conectarse a la BD antes de abrir el puerto. Reintenta igual que
// los demas servicios.
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await getPool();
      app.listen(PORT, () => {
        console.log(`Microservicio de Reportes corriendo en http://localhost:${PORT}`);
      });
      crearVistasAnalisis();
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] reportes-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] reportes-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
/**
 * Vistas de solo lectura con los nombres del Analisis (internos,
 * examenes_laboratorio, log_auditoria...). Las tablas las crean los demas
 * servicios: se reintenta cada 10 s hasta que existan todas.
 */
async function crearVistasAnalisis(intento = 1) {
  try {
    const { creadas, pendientes } = await new VistasAnalisisRepository().crearTodas();
    if (!pendientes.length) return console.log(`[vistas] ${creadas.length} vistas del Analisis listas`);
    if (intento >= 30) return console.warn(`[vistas] sin crear: ${pendientes.map(p => p.vista).join(', ')}`);
  } catch (err) {
    if (intento >= 30) return console.warn(`[vistas] ${err.message}`);
  }
  setTimeout(() => crearVistasAnalisis(intento + 1), 10000).unref();
}

arrancar();
