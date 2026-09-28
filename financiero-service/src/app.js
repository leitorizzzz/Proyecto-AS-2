require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const CuentaRepository = require('./repositories/CuentaRepository');
const DonanteRepository = require('./repositories/DonanteRepository');
const MovimientosRepository = require('./repositories/MovimientosRepository');
const FinancieroService = require('./services/FinancieroService');
const FinancieroController = require('./controllers/FinancieroController');
const crearRutasFinanciero = require('./routes/financieroRoutes');

const cuentaRepo = new CuentaRepository();
const donanteRepo = new DonanteRepository();
const movimientosRepo = new MovimientosRepository();
const financieroService = new FinancieroService(cuentaRepo, donanteRepo, movimientosRepo);
const financieroController = new FinancieroController(financieroService);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'financiero-service' });
});

app.use('/api/financiero', crearRutasFinanciero(financieroController));

const PORT = process.env.PORT || 3004;

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio Financiero corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
