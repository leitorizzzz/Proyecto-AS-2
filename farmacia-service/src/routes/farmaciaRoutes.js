const express = require('express');
const autenticar = require('../middleware/authMiddleware');

function crearRutasFarmacia(farmaciaController) {
  const router = express.Router();

  // Todas las rutas de farmacia requieren token valido
  router.use(autenticar);

  // Inventario de medicamentos (CRUD)
  router.get('/medicamentos', farmaciaController.listarMedicamentos);
  router.get('/medicamentos/:id', farmaciaController.obtenerMedicamento);
  router.post('/medicamentos', farmaciaController.crearMedicamento);
  router.put('/medicamentos/:id', farmaciaController.actualizarMedicamento);
  router.delete('/medicamentos/:id', farmaciaController.eliminarMedicamento);

  // Prescripciones pendientes (lectura desde visita_prescripciones)
  router.get(
    '/prescripciones/pendientes/paciente/:idPaciente',
    farmaciaController.prescripcionesPendientesPaciente
  );

  // Dispensacion de medicamentos a pacientes (requiere prescripcion valida, RN-06)
  router.post('/dispensaciones', farmaciaController.dispensar);
  router.get('/dispensaciones/paciente/:idPaciente', farmaciaController.historialPaciente);

  return router;
}

module.exports = crearRutasFarmacia;
