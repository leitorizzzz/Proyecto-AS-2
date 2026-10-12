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

// Resiliencia de arranque: SQL Server puede tardar en estar listo
// despues de un `docker compose up`. En lugar de salir inmediatamente,
// reintenta hasta MAX_INTENTOS con espera entre intentos.
const MAX_INTENTOS = Number(process.env.DB_BOOTSTRAP_MAX_INTENTOS || 10);
const ESPERA_MS    = Number(process.env.DB_BOOTSTRAP_ESPERA_MS || 3000);

async function arrancar() {
  for (let i = 1; i <= MAX_INTENTOS; i++) {
    try {
      await inicializarEsquema();
      app.listen(PORT, () => {
        console.log(`Microservicio de Autenticacion corriendo en http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const motivo = String(err.message || err).split('\n')[0];
      console.log(`[bootstrap] auth-service: intento ${i}/${MAX_INTENTOS} - BD no lista (${motivo})`);
      if (i === MAX_INTENTOS) {
        console.error('[bootstrap] auth-service: se agotaron los reintentos. Saliendo.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, ESPERA_MS));
    }
  }
}
arrancar();
