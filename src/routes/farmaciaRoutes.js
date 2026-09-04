const express = require('express');

function crearRutasFarmacia(farmaciaController) {
  const router = express.Router();

  // Inventario de medicamentos (CRUD)
  router.get('/medicamentos', farmaciaController.listarMedicamentos);
  router.get('/medicamentos/:id', farmaciaController.obtenerMedicamento);
  router.post('/medicamentos', farmaciaController.crearMedicamento);
  router.put('/medicamentos/:id', farmaciaController.actualizarMedicamento);
  router.delete('/medicamentos/:id', farmaciaController.eliminarMedicamento);

  // Dispensacion de medicamentos a pacientes
  router.post('/dispensaciones', farmaciaController.dispensar);
  router.get('/dispensaciones/paciente/:idPaciente', farmaciaController.historialPaciente);

  return router;
}

module.exports = crearRutasFarmacia;
