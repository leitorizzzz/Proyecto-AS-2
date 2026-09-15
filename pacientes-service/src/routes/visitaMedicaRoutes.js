const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

/**
 * Rutas de visitas medicas. Todas requieren JWT.
 * Registrar diagnostico/observaciones/examenes/prescripciones y cerrar la
 * visita esta restringido a medico_especialista.
 */
function crearRutasVisitas(visitaController) {
  const router = express.Router();

  router.use(autenticar);

  // Lectura: cualquier usuario autenticado
  router.get('/paciente/:idPaciente', visitaController.listarPorPaciente);
  router.get('/:id', visitaController.obtener);

  const soloEspecialista = autorizarRoles('medico_especialista');

  router.patch('/:id', soloEspecialista, visitaController.actualizarClinico);
  router.post('/:id/examenes', soloEspecialista, visitaController.agregarExamen);
  router.post('/:id/prescripciones', soloEspecialista, visitaController.agregarPrescripcion);
  router.post('/:id/completar', soloEspecialista, visitaController.completar);

  return router;
}

module.exports = crearRutasVisitas;
