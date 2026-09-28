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

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Laboratorio corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
