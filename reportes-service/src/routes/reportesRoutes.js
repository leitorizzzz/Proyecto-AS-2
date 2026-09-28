const express = require('express');
const autenticar = require('../middleware/authMiddleware');

function crearRutasReportes(ctrl) {
  const router = express.Router();
  router.use(autenticar);

  router.get('/tipos', ctrl.listarTipos);
  router.get('/:tipo', ctrl.generarReporte);

  return router;
}

module.exports = crearRutasReportes;
