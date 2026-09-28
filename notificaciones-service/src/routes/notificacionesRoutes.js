const express = require('express');
const autenticar = require('../middleware/authMiddleware');

function crearRutasNotificaciones(ctrl) {
  const router = express.Router();
  router.use(autenticar);

  // Endpoint invocado por pacientes-service cuando se crea una solicitud
  router.post('/solicitud', ctrl.enviarSolicitud);
  router.get('/', ctrl.log);

  return router;
}

module.exports = crearRutasNotificaciones;
