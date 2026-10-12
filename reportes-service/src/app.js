require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { getPool } = require('./repositories/database');
const ReportesRepository = require('./repositories/ReportesRepository');
const ReportesService = require('./services/ReportesService');
const ReportesController = require('./controllers/ReportesController');
const crearRutasReportes = require('./routes/reportesRoutes');

const repo = new ReportesRepository();
const service = new ReportesService(repo);
const controller = new ReportesController(service);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'reportes-service' });
});

app.use('/api/reportes', crearRutasReportes(controller));

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
arrancar();
