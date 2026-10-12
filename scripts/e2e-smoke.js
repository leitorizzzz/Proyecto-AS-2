#!/usr/bin/env node
/*
 * Smoke test end-to-end contra el stack docker-compose levantado.
 *
 * Recorre el flujo real del sistema:
 *   1. login admin
 *   2. crea paciente
 *   3. medico_general crea solicitud
 *   4. coordinador asigna cita
 *   5. especialista convierte a visita
 *   6. especialista agrega diagnostico + observaciones + examen + prescripcion
 *   7. especialista completa la visita
 *   8. laboratorio registra resultado del examen
 *   9. farmacia dispensa la prescripcion
 *  10. segundo intento de dispensacion -> rechazo esperado (RN-06)
 *  11. verifica que la notificacion aparece en el log
 *  12. verifica estado de cuenta del paciente
 *
 * No usa dependencias nuevas (fetch nativo de Node 20+).
 * Imprime un paso por linea con [ OK ] / [FALLA] y sale con codigo
 * distinto de 0 si al menos un paso falla.
 *
 * Precondiciones (todas las cumple `npm run bootstrap`):
 *   - docker compose up corriendo
 *   - admin seedeado (seed-admin del auth-service)
 *   - seed-demo corrido para que exista medico_general, coordinador,
 *     etc. Si falta, el test crea los usuarios al vuelo con
 *     el admin.
 *
 * Uso:
 *   npm run test:e2e
 *   BASE_HOST=100.96.172.77 npm run test:e2e
 */

const BASE_HOST = process.env.BASE_HOST || 'localhost';
const PUERTOS = {
  auth: 3000, farmacia: 3001, pacientes: 3002,
  laboratorio: 3003, financiero: 3004, reportes: 3005, notificaciones: 3006
};
const API = Object.fromEntries(
  Object.entries(PUERTOS).map(([k, v]) => [k, `http://${BASE_HOST}:${v}`])
);
const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@asilo.gt',
  password: process.env.ADMIN_PASSWORD || 'Admin12345'
};

// -------- utilidades ----------
let hubieronFallos = 0;
let pasoActual = 0;

function paso(nombre) {
  pasoActual += 1;
  process.stdout.write(`[${String(pasoActual).padStart(2, '0')}] ${nombre.padEnd(60, ' ')} `);
}
function ok(detalle = '') {
  console.log(`[ OK ] ${detalle}`);
}
function falla(mensaje) {
  hubieronFallos += 1;
  console.log(`[FALLA] ${mensaje}`);
}

async function req(method, url, { body, token, esperarStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (esperarStatus != null && r.status !== esperarStatus) {
    const err = new Error(`esperaba ${esperarStatus}, recibio ${r.status}: ${JSON.stringify(data)}`);
    err.status = r.status; err.data = data;
    throw err;
  }
  return { status: r.status, data };
}

async function login(email, password) {
  const r = await req('POST', `${API.auth}/api/auth/login`, {
    body: { email, password }, esperarStatus: 200
  });
  return r.data.token;
}

async function asegurarUsuario(adminToken, u) {
  const r = await req('POST', `${API.auth}/api/auth/register`, { body: u, token: adminToken });
  // 201 = creado, 400 "ya existe" = ok, otro = reportar
  if (r.status === 201) return 'creado';
  if (r.status === 400 && /ya existe/i.test(String(r.data?.error))) return 'existe';
  throw new Error(`register ${u.email}: ${r.status} ${JSON.stringify(r.data)}`);
}

// -------- main ----------
(async function main() {
  console.log(`\nSmoke E2E apuntando a http://${BASE_HOST}\n`);

  let adminToken, mgToken, cfToken, meToken, labToken, farToken;
  let pacienteId, solicitudId, visitaId, prescripcionId, examenId, idEsp;

  // 00 - preparar usuarios (el smoke no depende de seed-demo)
  paso('login admin');
  try { adminToken = await login(ADMIN.email, ADMIN.password); ok(); }
  catch (e) { falla(e.message); return finalizar(); }

  paso('asegurar usuarios de prueba (medico_general, coord, especialista, laboratorio, farmacia)');
  try {
    const usuarios = [
      { nombre: 'E2E Medico General',   email: 'e2e.medicogeneral@asilo.gt', password: 'E2eDemo1234', rol: 'medico_general' },
      { nombre: 'E2E Coordinador',       email: 'e2e.coordinador@asilo.gt',   password: 'E2eDemo1234', rol: 'coordinador_fundacion' },
      { nombre: 'E2E Especialista',      email: 'e2e.especialista@asilo.gt',  password: 'E2eDemo1234', rol: 'medico_especialista' },
      { nombre: 'E2E Laboratorio',       email: 'e2e.laboratorio@asilo.gt',   password: 'E2eDemo1234', rol: 'laboratorio' },
      { nombre: 'E2E Farmacia',          email: 'e2e.farmacia@asilo.gt',      password: 'E2eDemo1234', rol: 'farmacia' }
    ];
    for (const u of usuarios) await asegurarUsuario(adminToken, u);
    mgToken  = await login('e2e.medicogeneral@asilo.gt', 'E2eDemo1234');
    cfToken  = await login('e2e.coordinador@asilo.gt',   'E2eDemo1234');
    meToken  = await login('e2e.especialista@asilo.gt',  'E2eDemo1234');
    labToken = await login('e2e.laboratorio@asilo.gt',   'E2eDemo1234');
    farToken = await login('e2e.farmacia@asilo.gt',      'E2eDemo1234');
    // id del especialista para asignar cita
    const me = await req('GET', `${API.auth}/api/auth/me`, { token: meToken, esperarStatus: 200 });
    idEsp = me.data.id;
    ok(`idEspecialista=${idEsp}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 01 - crear paciente
  paso('crear paciente E2E (DPI unico por timestamp)');
  try {
    const dpi = String(Date.now()).padStart(13, '0').slice(-13);
    const r = await req('POST', `${API.pacientes}/api/pacientes`, {
      body: {
        nombres: 'E2E', apellidos: `Smoke ${new Date().toISOString().slice(0,10)}`,
        fechaNacimiento: '1945-01-01', genero: 'M', dpi,
        familiarEmail: 'e2e.familiar@example.com'
      },
      token: adminToken, esperarStatus: 201
    });
    pacienteId = r.data.id;
    ok(`id=${pacienteId}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 02 - medico general crea solicitud (dispara notificacion)
  paso('medico_general: POST /api/solicitudes (dispara notificacion)');
  try {
    const r = await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'cardiologia-e2e', motivo: 'Smoke e2e' },
      token: mgToken, esperarStatus: 201
    });
    solicitudId = r.data.id;
    ok(`solicitudId=${solicitudId} estado=${r.data.estado}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 03 - coordinador asigna cita
  paso('coordinador: PATCH /api/solicitudes/:id/asignar-cita');
  try {
    const r = await req('PATCH', `${API.pacientes}/api/solicitudes/${solicitudId}/asignar-cita`, {
      body: { fechaCita: '2026-12-01', horaCita: '10:00', idMedicoEspecialista: idEsp },
      token: cfToken, esperarStatus: 200
    });
    ok(`estado=${r.data.estado}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 04 - especialista convierte a visita
  paso('especialista: POST /api/solicitudes/:id/convertir-a-visita');
  try {
    const r = await req('POST', `${API.pacientes}/api/solicitudes/${solicitudId}/convertir-a-visita`, {
      token: meToken, esperarStatus: 201
    });
    visitaId = r.data.id;
    ok(`visitaId=${visitaId} estado=${r.data.estado}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 05 - diagnostico + observaciones
  paso('especialista: PATCH /api/visitas/:id (diagnostico+observaciones)');
  try {
    const r = await req('PATCH', `${API.pacientes}/api/visitas/${visitaId}`, {
      body: { diagnostico: 'E2E diagnostico', observaciones: 'E2E observaciones' },
      token: meToken, esperarStatus: 200
    });
    ok();
  } catch (e) { falla(e.message); return finalizar(); }

  // 06 - agregar examen
  paso('especialista: POST /api/visitas/:id/examenes');
  try {
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaId}/examenes`, {
      body: { tipo: 'Hematologia completa' },
      token: meToken, esperarStatus: 201
    });
    examenId = r.data.id;
    ok(`examenId=${examenId}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 07 - agregar prescripcion asociada al losartan del inventario
  paso('especialista: POST /api/visitas/:id/prescripciones con idMedicamento');
  try {
    const invResp = await req('GET', `${API.farmacia}/api/farmacia/medicamentos`, { token: adminToken, esperarStatus: 200 });
    const med = invResp.data.find(m => /losartan/i.test(m.nombre)) || invResp.data[0];
    if (!med) throw new Error('no hay medicamentos en inventario');
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaId}/prescripciones`, {
      body: { medicamento: med.nombre, dosis: '1/24h', indicaciones: 'con agua', idMedicamento: med.id },
      token: meToken, esperarStatus: 201
    });
    prescripcionId = r.data.id;
    ok(`prescripcionId=${prescripcionId} medicamento=${med.nombre}(#${med.id})`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 08 - laboratorio registra resultado
  paso('laboratorio: POST /api/laboratorio/resultados/examen/:idExamen');
  try {
    const r = await req('POST', `${API.laboratorio}/api/laboratorio/resultados/examen/${examenId}`, {
      body: { tipoResultado: 'texto', valorTexto: 'Dentro de rango (e2e)' },
      token: labToken, esperarStatus: 201
    });
    ok(`estado=${r.data.estado}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 09 - farmacia dispensa
  paso('farmacia: POST /api/farmacia/dispensaciones (RN-06 + RN-09)');
  try {
    const r = await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: prescripcionId, idPaciente: pacienteId, cantidad: 2 },
      token: farToken, esperarStatus: 201
    });
    ok(`costoTotal=${r.data.costoTotal} medicamento=${r.data.medicamento}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 10 - segundo intento rechazado (RN-06)
  paso('farmacia: segundo intento de dispensar -> 409 esperado');
  try {
    await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: prescripcionId, cantidad: 1 },
      token: farToken, esperarStatus: 409
    });
    ok('rechazo correcto');
  } catch (e) { falla(e.message); }

  // 11 - completar visita
  paso('especialista: POST /api/visitas/:id/completar');
  try {
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaId}/completar`, {
      token: meToken, esperarStatus: 200
    });
    ok(`estado=${r.data.estado}`);
  } catch (e) { falla(e.message); }

  // 12 - notificacion creada
  paso('notificaciones: existe una para este paciente');
  try {
    const r = await req('GET', `${API.notificaciones}/api/notificaciones?limit=20`, { token: adminToken, esperarStatus: 200 });
    const mia = r.data.find(n => n.idPaciente === pacienteId);
    if (!mia) throw new Error('no encontre notificacion del paciente');
    ok(`id=${mia.id} estado=${mia.estado}`);
  } catch (e) { falla(e.message); }

  // 13 - estado de cuenta del paciente
  paso('financiero: GET /api/financiero/estado-cuenta/:idPaciente');
  try {
    const r = await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacienteId}`, { token: adminToken, esperarStatus: 200 });
    ok(`saldoTotal=${r.data.saldoTotal} alerta=${r.data.alerta?.nivel || 'ninguna'}`);
  } catch (e) { falla(e.message); }

  finalizar();
})().catch(err => {
  console.error('\nERROR INESPERADO:', err.message);
  process.exit(2);
});

function finalizar() {
  console.log();
  if (hubieronFallos === 0) {
    console.log(`Smoke E2E OK — ${pasoActual} pasos ejecutados.`);
    process.exit(0);
  }
  console.log(`Smoke E2E con ${hubieronFallos} falla(s) de ${pasoActual} paso(s).`);
  process.exit(1);
}
