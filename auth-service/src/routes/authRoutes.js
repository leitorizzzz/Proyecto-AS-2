const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasAuth(authController) {
  const router = express.Router();

  // Crear usuarios es una operacion administrativa: exige token valido Y rol
  // admin. El primer admin no se crea por aqui, sino con `npm run seed`.
  router.post('/register', autenticar, autorizarRoles('admin'), authController.register);

  router.post('/login', authController.login);
  router.get('/me', autenticar, authController.me);

  return router;
}

module.exports = crearRutasAuth;
