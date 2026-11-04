/**
 * Pruebas RBAC de financiero-service: toda escritura de caja es solo
 * admin; la lectura queda abierta a cualquier autenticado.
 */
process.env.JWT_SECRET = 'test-secret-rbac';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const crearRutasFinanciero = require('../src/routes/financieroRoutes');

function tokenConRol(rol) {
  return jwt.sign({ sub: 1, email: 'x@asilo.gt', rol }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function app() {
  const lista = (_r, res) => res.json([]);
  const creado = (_r, res) => res.status(201).json({ id: 1 });
  const ctrlStub = {
    estadoCuenta: (_r, res) => res.json({}),
    crearCargo: creado, registrarPago: creado, abonarCargo: creado,
    alertas: lista, alertasPorCuota: lista, emitirCuota: creado,
    listarDonantes: lista, crearDonante: creado,
    desactivarDonante: (_r, res) => res.json({}), reactivarDonante: (_r, res) => res.json({}),
    listarDonaciones: lista, registrarDonacion: creado,
    listarGastos: lista, registrarGasto: creado,
    listarPagosFundacion: lista, registrarPagoFundacion: creado
  };
  const a = express();
  a.use(express.json());
  a.use('/api/financiero', crearRutasFinanciero(ctrlStub));
  return a;
}

describe('RBAC financiero-service', () => {
  const srv = app();
  const con = rol => ({ Authorization: `Bearer ${tokenConRol(rol)}` });

  test('registrar gasto con rol coordinador_fundacion -> 403', async () => {
    expect((await request(srv).post('/api/financiero/gastos').set(con('coordinador_fundacion')).send({})).status).toBe(403);
  });

  test('registrar pago a fundacion con rol farmacia -> 403', async () => {
    expect((await request(srv).post('/api/financiero/pagos-fundacion').set(con('farmacia')).send({})).status).toBe(403);
  });

  // Caso 21: el panel de alertas es de quienes llevan la caja; emitir cuota, solo admin.
  test('alertas de cobro: admin y coordinador_fundacion 200, enfermero 403', async () => {
    expect((await request(srv).get('/api/financiero/alertas').set(con('admin'))).status).toBe(200);
    expect((await request(srv).get('/api/financiero/alertas').set(con('coordinador_fundacion'))).status).toBe(200);
    expect((await request(srv).get('/api/financiero/alertas').set(con('enfermero'))).status).toBe(403);
  });

  test('emitir cuota: admin 201, coordinador_fundacion 403', async () => {
    expect((await request(srv).post('/api/financiero/cuotas').set(con('admin')).send({})).status).toBe(201);
    expect((await request(srv).post('/api/financiero/cuotas').set(con('coordinador_fundacion')).send({})).status).toBe(403);
  });

  test('registrar gasto con rol admin -> 201', async () => {
    expect((await request(srv).post('/api/financiero/gastos').set(con('admin')).send({})).status).toBe(201);
  });

  test('listar gastos con rol coordinador_fundacion -> 200', async () => {
    expect((await request(srv).get('/api/financiero/gastos').set(con('coordinador_fundacion'))).status).toBe(200);
  });

  test('abonar a un cargo con rol coordinador_fundacion -> 403 (solo admin)', async () => {
    expect((await request(srv).post('/api/financiero/cargos/1/abonos').set(con('coordinador_fundacion')).send({})).status).toBe(403);
  });

  test('desactivar donante con rol coordinador_fundacion -> 403', async () => {
    expect((await request(srv).patch('/api/financiero/donantes/1/desactivar').set(con('coordinador_fundacion'))).status).toBe(403);
  });

  test('reactivar donante con rol admin -> 200', async () => {
    expect((await request(srv).patch('/api/financiero/donantes/1/reactivar').set(con('admin'))).status).toBe(200);
  });
});
