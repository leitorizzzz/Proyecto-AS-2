const express = require('express');
const autenticar = require('../middleware/authMiddleware');

function crearRutasPacientes(pacienteController) {
  const router = express.Router();

  // Todas las rutas de pacientes requieren token valido
  router.use(autenticar);

  router.get('/', pacienteController.listar);
  router.get('/:id', pacienteController.obtener);
  router.post('/', pacienteController.crear);
  router.put('/:id', pacienteController.actualizar);
  router.delete('/:id', pacienteController.eliminar);

  return router;
}

module.exports = crearRutasPacientes;
