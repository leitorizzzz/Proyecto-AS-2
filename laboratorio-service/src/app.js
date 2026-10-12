require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const ResultadoExamenRepository = require('./repositories/ResultadoExamenRepository');
const PacienteReadRepository = require('./repositories/PacienteReadRepository');
const LaboratorioService = require('./services/LaboratorioService');
const LaboratorioController = require('./controllers/LaboratorioController');
const crearRutasLaboratorio = require('./routes/laboratorioRoutes');

const resultadoRepo = new ResultadoExamenRepository();
const pacienteRepo = new PacienteReadRepository();
const laboratorioService = new LaboratorioService(resultadoRepo, pacienteRepo);
const laboratorioController = new LaboratorioController(laboratorioService);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'laboratorio-service' });
});

app.use('/api/laboratorio', crearRutasLaboratorio(laboratorioController));

const PORT = process.env.PORT || 3003;

// Resiliencia de arranque
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await inicializarEsquema();
      app.listen(PORT, () => {
        console.log(`Microservicio de Laboratorio corriendo en http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] laboratorio-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] laboratorio-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
arrancar();
