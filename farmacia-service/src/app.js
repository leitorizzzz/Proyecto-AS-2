require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { inicializarEsquema } = require('./repositories/database');
const MedicamentoRepository = require('./repositories/MedicamentoRepository');
const DispensacionRepository = require('./repositories/DispensacionRepository');
const PrescripcionReadRepository = require('./repositories/PrescripcionReadRepository');
const FarmaciaService = require('./services/FarmaciaService');
const FarmaciaController = require('./controllers/FarmaciaController');
const crearRutasFarmacia = require('./routes/farmaciaRoutes');

// --- Ensamblado de capas (inyeccion de dependencias manual) ---
// Presentacion -> Logica de Negocio -> Acceso a Datos -> Entidades
const medicamentoRepository = new MedicamentoRepository();
const dispensacionRepository = new DispensacionRepository();
const prescripcionRepository = new PrescripcionReadRepository();
const farmaciaService = new FarmaciaService(
  medicamentoRepository,
  dispensacionRepository,
  prescripcionRepository
);
const farmaciaController = new FarmaciaController(farmaciaService);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'farmacia-service' });
});

app.use('/api/farmacia', crearRutasFarmacia(farmaciaController));

const PORT = process.env.PORT || 3001;

// Resiliencia de arranque
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await inicializarEsquema();
      app.listen(PORT, () => {
        console.log(`Microservicio de Farmacia corriendo en http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] farmacia-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] farmacia-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
arrancar();
