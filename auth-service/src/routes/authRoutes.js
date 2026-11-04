const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasAuth(authController) {
  const router = express.Router();

  // Crear usuarios es una operacion administrativa: exige token valido Y rol
  // admin. El primer admin no se crea por aqui, sino con `npm run seed`.
  router.post('/register', autenticar, autorizarRoles('admin'), authController.register);

  router.post('/login', authController.login);

  // Recuperacion de contrasena (RF-42, UC-10.4): sin sesion.
  router.post('/recuperar', authController.recuperar);
  router.post('/restablecer', authController.restablecer);
  router.get('/me', autenticar, authController.me);
  // Cierre de sesion: revoca el token actual en los 7 servicios (caso 1).
  router.post('/logout', autenticar, authController.logout);
  // Cambio de contrasena del propio usuario (misma regla que alta y restablecer).
  router.post('/cambiar-password', autenticar, authController.cambiarPassword);

  // Directorio de personal (sin passwordHash). Lo usan coordinacion, para
  // elegir el especialista al asignar una cita, y el medico general, para
  // elegir el enfermero que acompana al paciente (caso 7).
  router.get('/usuarios', autenticar, autorizarRoles('admin', 'coordinador_fundacion', 'medico_general'),
    authController.listarUsuarios);

  // Desactivar / reactivar cuentas (borrado logico): solo admin.
  router.patch('/usuarios/:id/desactivar', autenticar, autorizarRoles('admin'),
    authController.desactivarUsuario);
  router.patch('/usuarios/:id/reactivar', autenticar, autorizarRoles('admin'),
    authController.reactivarUsuario);

  return router;
}

module.exports = crearRutasAuth;
