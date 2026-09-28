require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');

const PacienteRepository = require('./repositories/PacienteRepository');
const SolicitudRepository = require('./repositories/SolicitudRepository');
const VisitaMedicaRepository = require('./repositories/VisitaMedicaRepository');

const PacienteService = require('./services/PacienteService');
const SolicitudService = require('./services/SolicitudService');
const VisitaMedicaService = require('./services/VisitaMedicaService');
const NotificacionesClient = require('./services/NotificacionesClient');

const PacienteController = require('./controllers/PacienteController');
const SolicitudController = require('./controllers/SolicitudController');
const VisitaMedicaController = require('./controllers/VisitaMedicaController');

const crearRutasPacientes = require('./routes/pacientesRoutes');
const crearRutasSolicitudes = require('./routes/solicitudRoutes');
const crearRutasVisitas = require('./routes/visitaMedicaRoutes');

// --- Ensamblado de capas ---
// El servicio de Pacientes agrupa 3 dominios relacionados: Paciente,
// Solicitud de Referencia y Visita Medica.
const pacienteRepository = new PacienteRepository();
const solicitudRepository = new SolicitudRepository();
const visitaRepository = new VisitaMedicaRepository();

const notificacionesClient = new NotificacionesClient({
  baseUrl: process.env.NOTIFICACIONES_URL
});

const pacienteService = new PacienteService(pacienteRepository);
const solicitudService = new SolicitudService(solicitudRepository, pacienteRepository, notificacionesClient);
const visitaService = new VisitaMedicaService(visitaRepository, solicitudService);

const pacienteController = new PacienteController(pacienteService);
const solicitudController = new SolicitudController(solicitudService);
const visitaController = new VisitaMedicaController(visitaService);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'pacientes-service' });
});

app.use('/api/pacientes', crearRutasPacientes(pacienteController));
app.use('/api/solicitudes', crearRutasSolicitudes(solicitudController, visitaController));
app.use('/api/visitas', crearRutasVisitas(visitaController));

const PORT = process.env.PORT || 3002;

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Pacientes corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
