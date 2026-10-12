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

// Resiliencia de arranque
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await inicializarEsquema();
      app.listen(PORT, () => {
        console.log(`Microservicio Financiero corriendo en http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] financiero-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] financiero-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
arrancar();
