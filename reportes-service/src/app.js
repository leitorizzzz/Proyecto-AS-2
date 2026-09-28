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
// conectarse a la BD antes de abrir el puerto.
getPool()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Reportes corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error conectando a SQL Server:', err.message);
    process.exit(1);
  });
