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
    modoSimulacion: String(process.env.MODO_SIMULACION).toLowerCase() === 'true'
  });
});

app.use('/api/notificaciones', crearRutasNotificaciones(controller));

const PORT = process.env.PORT || 3006;

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Notificaciones corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
