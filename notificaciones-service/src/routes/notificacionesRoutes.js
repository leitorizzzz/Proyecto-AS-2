const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasNotificaciones(ctrl) {
  const router = express.Router();
  router.use(autenticar);

  // Endpoint invocado por pacientes-service cuando se crea una solicitud,
  // con el JWT del medico general que la crea (unico rol que crea
  // solicitudes). Antes cualquier usuario autenticado podia mandar un
  // correo a cualquier direccion desde la cuenta del asilo.
  router.post('/solicitud', autorizarRoles('medico_general'), ctrl.enviarSolicitud);
  // RF-42: solo auth-service (JWT de servicio con rol 'sistema').
  router.post('/recuperacion', autorizarRoles('sistema'), ctrl.enviarRecuperacion);

  // Listado + ver + reintentar manual (admin)
  router.get('/', ctrl.log);
  router.get('/:id', ctrl.obtener);
  router.post('/:id/reintentar', autorizarRoles('admin'), ctrl.reintentar);

  return router;
}

module.exports = crearRutasNotificaciones;
