const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasLaboratorio(laboratorioController) {
  const router = express.Router();

  router.use(autenticar);

  const soloLab = autorizarRoles('laboratorio', 'admin');

  router.get('/ordenes-pendientes', soloLab, laboratorioController.ordenesPendientes);
  router.get('/pacientes/dpi/:dpi', soloLab, laboratorioController.identificarPaciente);
  router.post('/resultados/examen/:idExamen', soloLab, laboratorioController.registrarResultado);
  router.get('/resultados/examen/:idExamen', laboratorioController.obtenerResultadoPorExamen);
  router.get('/examenes/:idExamen/costo', laboratorioController.costoConDescuento);

  return router;
}

module.exports = crearRutasLaboratorio;
