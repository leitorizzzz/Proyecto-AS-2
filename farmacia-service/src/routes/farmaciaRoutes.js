const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasFarmacia(farmaciaController) {
  const router = express.Router();

  // Todas las rutas de farmacia requieren token valido
  router.use(autenticar);

  // Escrituras de inventario y dispensacion: farmacia y administracion.
  // La lectura queda abierta a cualquier autenticado (el especialista
  // elige del inventario al prescribir).
  const soloFarmacia = autorizarRoles('farmacia', 'admin');

  // Inventario de medicamentos (CRUD)
  router.get('/medicamentos', farmaciaController.listarMedicamentos);
  router.get('/medicamentos/:id', farmaciaController.obtenerMedicamento);
  router.post('/medicamentos', soloFarmacia, farmaciaController.crearMedicamento);
  router.put('/medicamentos/:id', soloFarmacia, farmaciaController.actualizarMedicamento);
  router.delete('/medicamentos/:id', soloFarmacia, farmaciaController.eliminarMedicamento);

  // Prescripciones pendientes (lectura desde visita_prescripciones)
  router.get(
    '/prescripciones/pendientes/paciente/:idPaciente',
    farmaciaController.prescripcionesPendientesPaciente
  );

  // Dispensacion de medicamentos a pacientes (requiere prescripcion valida, RN-06)
  router.post('/dispensaciones', soloFarmacia, farmaciaController.dispensar);
  router.get('/dispensaciones/paciente/:idPaciente', farmaciaController.historialPaciente);

  return router;
}

module.exports = crearRutasFarmacia;
