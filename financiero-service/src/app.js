require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const CuentaRepository = require('./repositories/CuentaRepository');
const DonanteRepository = require('./repositories/DonanteRepository');
const MovimientosRepository = require('./repositories/MovimientosRepository');
const FinancieroService = require('./services/FinancieroService');
const FamiliarReadRepository = require('./repositories/FamiliarReadRepository');
const PrescripcionPorCobrarRepository = require('./repositories/PrescripcionPorCobrarRepository');
const FinancieroController = require('./controllers/FinancieroController');
const AuditoriaRepository = require('./repositories/AuditoriaRepository');
const AuditoriaService = require('./services/AuditoriaService');
const crearRutasFinanciero = require('./routes/financieroRoutes');
const { ocultarErrores500, manejadorErrores } = require('./middleware/manejoErrores');

const cuentaRepo = new CuentaRepository();
const donanteRepo = new DonanteRepository();
const movimientosRepo = new MovimientosRepository();
const financieroService = new FinancieroService(cuentaRepo, donanteRepo, movimientosRepo, new FamiliarReadRepository(),
  new PrescripcionPorCobrarRepository());
const financieroController = new FinancieroController(financieroService, new AuditoriaService(new AuditoriaRepository()));

const app = express();
// Caso 24: req.ip = IP real del cliente cuando llega por el nginx del frontend.
app.set('trust proxy', require('./middleware/confianzaProxy')());
app.use(cors());
app.use(express.json());
app.use(ocultarErrores500);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'financiero-service' });
});

app.use('/api/financiero', crearRutasFinanciero(financieroController));
// JSON malformado y errores no atrapados: respuesta JSON, sin traza.
app.use(manejadorErrores);

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
