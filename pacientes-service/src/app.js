require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const PacienteRepository = require('./repositories/PacienteRepository');
const PacienteService = require('./services/PacienteService');
const PacienteController = require('./controllers/PacienteController');
const crearRutasPacientes = require('./routes/pacientesRoutes');

// --- Ensamblado de capas ---
const pacienteRepository = new PacienteRepository();
const pacienteService = new PacienteService(pacienteRepository);
const pacienteController = new PacienteController(pacienteService);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'pacientes-service' });
});

app.use('/api/pacientes', crearRutasPacientes(pacienteController));

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
