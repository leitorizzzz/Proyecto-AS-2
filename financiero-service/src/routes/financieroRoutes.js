const express = require('express');
const autenticar = require('../middleware/authMiddleware');
const autorizarRoles = require('../middleware/autorizarRoles');

function crearRutasFinanciero(ctrl) {
  const router = express.Router();
  router.use(autenticar);

  const soloAdmin = autorizarRoles('admin');

  router.get('/estado-cuenta/:idPaciente', ctrl.estadoCuenta);
  router.post('/cargos', soloAdmin, ctrl.crearCargo);
  router.post('/pagos-cuota', soloAdmin, ctrl.registrarPago);

  router.get('/donantes', ctrl.listarDonantes);
  router.post('/donantes', soloAdmin, ctrl.crearDonante);

  router.get('/donaciones', ctrl.listarDonaciones);
  router.post('/donaciones', soloAdmin, ctrl.registrarDonacion);

  router.get('/gastos', ctrl.listarGastos);
  router.post('/gastos', soloAdmin, ctrl.registrarGasto);

  router.get('/pagos-fundacion', ctrl.listarPagosFundacion);
  router.post('/pagos-fundacion', soloAdmin, ctrl.registrarPagoFundacion);

  return router;
}

module.exports = crearRutasFinanciero;
