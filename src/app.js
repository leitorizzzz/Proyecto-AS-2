const express = require('express');
const cors = require('cors');
const path = require('path');

const MedicamentoRepository = require('./repositories/MedicamentoRepository');
const DispensacionRepository = require('./repositories/DispensacionRepository');
const FarmaciaService = require('./services/FarmaciaService');
const FarmaciaController = require('./controllers/FarmaciaController');
const crearRutasFarmacia = require('./routes/farmaciaRoutes');

// --- Ensamblado de capas (inyeccion de dependencias manual) ---
// Presentacion -> Logica de Negocio -> Acceso a Datos -> Entidades
const medicamentoRepository = new MedicamentoRepository();
const dispensacionRepository = new DispensacionRepository();
const farmaciaService = new FarmaciaService(medicamentoRepository, dispensacionRepository);
const farmaciaController = new FarmaciaController(farmaciaService);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'farmacia-service' });
});

app.use('/api', crearRutasFarmacia(farmaciaController));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Microservicio de Farmacia corriendo en http://localhost:${PORT}`);
});
