const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

/**
 * GET /api/auditoria?desde=&hasta=&entidad=&idEntidad=&limite=
 * Bitacora de acciones (crear / modificar / cancelar / desactivar /
 * reactivar). Solo administracion.
 */
function crearRutasAuditoria(ctrl) {
  const router = express.Router();
  router.use(autenticar);
  router.get('/', autorizarRoles('admin'), ctrl.listar);
  return router;
}

module.exports = crearRutasAuditoria;
