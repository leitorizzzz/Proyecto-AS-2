const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

/**
 * Rutas de solicitudes de referencia + accion de conversion a visita.
 * Todas requieren JWT valido. El rol se valida por endpoint.
 */
function crearRutasSolicitudes(solicitudController, visitaController) {
  const router = express.Router();

  router.use(autenticar);

  // Lectura: cualquier usuario autenticado del sistema
  router.get('/', solicitudController.listar);
  router.get('/paciente/:idPaciente', solicitudController.listarPorPaciente);
  router.get('/:id', solicitudController.obtener);

  // Crear solicitud: medico_general
  router.post(
    '/',
    autorizarRoles('medico_general'),
    solicitudController.crear
  );

  // Asignar fecha/hora/medico especialista: coordinador_fundacion o admin
  router.patch(
    '/:id/asignar-cita',
    autorizarRoles('coordinador_fundacion', 'admin'),
    solicitudController.asignarCita
  );

  // Convertir solicitud en visita: medico_especialista
  router.post(
    '/:id/convertir-a-visita',
    autorizarRoles('medico_especialista'),
    visitaController.convertirDesdeSolicitud
  );

  // Cancelar: medico_general o admin
  router.patch(
    '/:id/cancelar',
    autorizarRoles('medico_general', 'admin'),
    solicitudController.cancelar
  );

  return router;
}

module.exports = crearRutasSolicitudes;
