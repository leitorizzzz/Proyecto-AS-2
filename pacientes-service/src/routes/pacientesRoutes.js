const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasPacientes(pacienteController) {
  const router = express.Router();

  // Todas las rutas de pacientes requieren token valido
  router.use(autenticar);

  // Lectura: cualquier autenticado (?incluirInactivos=true solo admin).
  // Alta y edicion del expediente: enfermeria y administracion.
  // Desactivar (DELETE = borrado logico) y reactivar: solo administracion.
  const registraPacientes = autorizarRoles('enfermero', 'admin');

  router.get('/', pacienteController.listar);
  router.get('/:id', pacienteController.obtener);
  router.post('/', registraPacientes, pacienteController.crear);
  router.put('/:id', registraPacientes, pacienteController.actualizar);
  router.put('/:id/familiar', registraPacientes, pacienteController.actualizarFamiliar);
  router.delete('/:id', autorizarRoles('admin'), pacienteController.desactivar);
  router.patch('/:id/reactivar', autorizarRoles('admin'), pacienteController.reactivar);

  return router;
}

module.exports = crearRutasPacientes;
