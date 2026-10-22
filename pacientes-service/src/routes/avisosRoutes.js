const express = require('express');
const autenticar = require('../middleware/authMiddleware');

/**
 * Notificaciones internas del usuario autenticado (caso 12).
 *   GET   /api/avisos[?noLeidos=true]
 *   PATCH /api/avisos/:id/leido
 */
function crearRutasAvisos(avisoController) {
  const router = express.Router();
  router.use(autenticar);
  router.get('/', avisoController.listar);
  router.patch('/:id/leido', avisoController.marcarLeido);
  return router;
}

module.exports = crearRutasAvisos;
