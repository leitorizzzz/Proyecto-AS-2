const express = require('express');
const autenticar = require('../middleware/authMiddleware');

function crearRutasAuth(authController) {
  const router = express.Router();

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.get('/me', autenticar, authController.me);

  return router;
}

module.exports = crearRutasAuth;
