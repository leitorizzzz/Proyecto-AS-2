require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { inicializarEsquema } = require('./repositories/database');
const UsuarioRepository = require('./repositories/UsuarioRepository');
const AuthService = require('./services/AuthService');
const AuthController = require('./controllers/AuthController');
const crearRutasAuth = require('./routes/authRoutes');

// --- Ensamblado de capas ---
const usuarioRepository = new UsuarioRepository();
const authService = new AuthService(usuarioRepository);
const authController = new AuthController(authService);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'auth-service' });
});

app.use('/api/auth', crearRutasAuth(authController));

const PORT = process.env.PORT || 3000;

inicializarEsquema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Microservicio de Autenticacion corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando esquema en SQL Server:', err.message);
    process.exit(1);
  });
