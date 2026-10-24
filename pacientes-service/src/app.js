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
const AuditoriaRepository = require('./repositories/AuditoriaRepository');
const AuditoriaService = require('./services/AuditoriaService');

const crearRutasPacientes = require('./routes/pacientesRoutes');
const crearRutasSolicitudes = require('./routes/solicitudRoutes');
const crearRutasVisitas = require('./routes/visitaMedicaRoutes');
const crearRutasAvisos = require('./routes/avisosRoutes');
const FamiliarRepository = require('./repositories/FamiliarRepository');
const UsuarioReadRepository = require('./repositories/UsuarioReadRepository');
const AvisoRepository = require('./repositories/AvisoRepository');
const AvisoService = require('./services/AvisoService');
const AvisoController = require('./controllers/AvisoController');

// --- Ensamblado de capas ---
// El servicio de Pacientes agrupa 3 dominios relacionados: Paciente,
// Solicitud de Referencia y Visita Medica.
const pacienteRepository = new PacienteRepository();
const solicitudRepository = new SolicitudRepository();
const visitaRepository = new VisitaMedicaRepository();

const notificacionesClient = new NotificacionesClient({
  baseUrl: process.env.NOTIFICACIONES_URL
});

const familiarRepository = new FamiliarRepository();
const avisoRepository = new AvisoRepository();
const pacienteService = new PacienteService(pacienteRepository, familiarRepository);
const solicitudService = new SolicitudService(solicitudRepository, pacienteRepository, notificacionesClient,
  new UsuarioReadRepository(), avisoRepository);
const visitaService = new VisitaMedicaService(visitaRepository, solicitudService, pacienteRepository);

const auditoriaService = new AuditoriaService(new AuditoriaRepository());
const pacienteController = new PacienteController(pacienteService, auditoriaService);
const solicitudController = new SolicitudController(solicitudService, auditoriaService);
const visitaController = new VisitaMedicaController(visitaService, auditoriaService);

const app = express();
// Caso 24: req.ip = IP real del cliente cuando llega por el nginx del frontend.
app.set('trust proxy', require('./middleware/confianzaProxy')());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'pacientes-service' });
});

app.use('/api/pacientes', crearRutasPacientes(pacienteController));
app.use('/api/solicitudes', crearRutasSolicitudes(solicitudController, visitaController));
app.use('/api/visitas', crearRutasVisitas(visitaController));
app.use('/api/avisos', crearRutasAvisos(new AvisoController(new AvisoService(avisoRepository))));

const PORT = process.env.PORT || 3002;

// Resiliencia de arranque: SQL Server puede tardar en responder.
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await inicializarEsquema();
      app.listen(PORT, () => {
        console.log(`Microservicio de Pacientes corriendo en http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] pacientes-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] pacientes-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
arrancar();
