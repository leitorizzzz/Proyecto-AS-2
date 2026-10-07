require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const NotificacionRepository = require('./repositories/NotificacionRepository');
const NotificacionesService = require('./services/NotificacionesService');
const NotificacionesController = require('./controllers/NotificacionesController');
const crearRutasNotificaciones = require('./routes/notificacionesRoutes');

const repo = new NotificacionRepository();
const service = new NotificacionesService(repo);
const controller = new NotificacionesController(service);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    servicio: 'notificaciones-service',
    modoSimulacion: String(process.env.MODO_SIMULACION).toLowerCase() === 'true',
    maxIntentos: Math.max(1, Number(process.env.NOTIF_MAX_INTENTOS || 3))
  });
});

app.use('/api/notificaciones', crearRutasNotificaciones(controller));

const PORT = process.env.PORT || 3006;
const INTERVALO_JOB_MS = Math.max(5000,
  Number(process.env.NOTIF_INTERVALO_JOB_SEG || 30) * 1000);

// Job de reintentos: corre dentro del mismo proceso. No introduce
// dependencias nuevas (nada de bull/agenda). Se arranca despues de que
// el esquema este listo.
function arrancarJobReintentos() {
  let corriendo = false;
  setInterval(async () => {
    if (corriendo) return; // evita solapamientos
    corriendo = true;
    try {
      const procesadas = await service.procesarReintentosPendientes();
      if (procesadas > 0) {
        console.log(`[reintentos] procesadas ${procesadas} notificacion(es)`);
      }
    } catch (err) {
      console.warn(`[reintentos] error en el ciclo: ${err.message}`);
    } finally {
      corriendo = false;
    }
  }, INTERVALO_JOB_MS);
}

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Notificaciones corriendo en http://localhost:${PORT}`);
      console.log(`[reintentos] job cada ${INTERVALO_JOB_MS / 1000}s`);
      arrancarJobReintentos();
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
