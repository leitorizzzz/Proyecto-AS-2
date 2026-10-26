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
 * REGLA: el smoke solo crea, modifica, desactiva o reactiva registros que
 * creo el mismo (pacientes "E2E ...", medicamento "E2E medicamento <ts>",
 * precio "E2E examen (no usar)", donantes y usuarios "e2e.*"). Los datos
 * existentes (demo o reales) solo se LEEN.
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
// Mismos servicios a traves del nginx del frontend (como los usa el navegador).
const NGINX = `http://${BASE_HOST}:${process.env.PUERTO_FRONTEND || 8090}/svc`;
const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@asilo.gt',
  password: process.env.ADMIN_PASSWORD || 'Admin12345'
};

// -------- utilidades ----------
let hubieronFallos = 0;
let pasoActual = 0;
/** Dia de Guatemala dentro de N dias (YYYY-MM-DD): una cita no puede ser en el pasado. */
const diaFuturo = n => new Date(Date.now() - 6 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

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

/**
 * Lee de la tabla notificaciones el enlace de recuperacion enviado a un
 * correo. La API lo oculta a proposito (RF-42); solo se puede en el stack
 * local, con docker. Devuelve null si no hay docker a mano.
 */
function enlaceRecuperacionLocal(email) {
  if (!['localhost', '127.0.0.1'].includes(BASE_HOST)) return null;
  const { execFileSync } = require('child_process');
  const consulta = `SET NOCOUNT ON; SELECT TOP 1 cuerpo FROM notificaciones WHERE destinatarioEmail = '${email.replace(/'/g, "''")}' AND tipoEvento = 'recuperacion_password' ORDER BY id DESC`;
  try {
    const salida = execFileSync('docker', ['exec', 'asilo-sqlserver', 'sh', '-c',
      'SQLCMD=$(ls /opt/mssql-tools*/bin/sqlcmd | head -1); $SQLCMD -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d AsiloCabezaAlgodon -y 0 -Q "$0"', consulta],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (salida.match(/#restablecer=([A-Za-z0-9_-]{43})/) || [])[1] || null;
  } catch { return null; }
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
// Caso 5: todo interno se registra con su familiar responsable completo.
function familiarE2E(dpi) {
  return { nombres: 'Familiar', apellidos: 'E2E Responsable', dpi, parentesco: 'hijo(a)',
           telefono: '55550000', email: 'e2e.familiar@example.com', direccion: 'Mazatenango (e2e)' };
}

(async function main() {
  console.log(`\nSmoke E2E apuntando a http://${BASE_HOST}\n`);

  let adminToken, mgToken, cfToken, meToken, labToken, farToken, enfToken;
  let pacienteId, solicitudId, visitaId, prescripcionId, examenId, idEsp, idEnf, idMg;
  let medE2E;   // medicamento propio: no se toca el stock del inventario real
  let cargoVisita; // cargo generado al cerrar la visita (caso 19)
  let conceptoPagoE2E; // pago a fundacion propio (rango de reportes)
  let abonosE2E;       // { idCargo, total }: abonos del caso 20 (reportes de ingresos)
  const TS = Date.now();

  // 00 - preparar usuarios (el smoke no depende de seed-demo)
  paso('login admin');
  try { adminToken = await login(ADMIN.email, ADMIN.password); ok(); }
  catch (e) { falla(e.message); return finalizar(); }

  paso('asegurar usuarios de prueba (medico_general, coord, especialista, laboratorio, farmacia, enfermero)');
  try {
    const usuarios = [
      { nombre: 'E2E Medico General',   email: 'e2e.medicogeneral@asilo.gt', password: 'E2eDemo1234', rol: 'medico_general' },
      { nombre: 'E2E Coordinador',       email: 'e2e.coordinador@asilo.gt',   password: 'E2eDemo1234', rol: 'coordinador_fundacion' },
      { nombre: 'E2E Especialista',      email: 'e2e.especialista@asilo.gt',  password: 'E2eDemo1234', rol: 'medico_especialista' },
      { nombre: 'E2E Laboratorio',       email: 'e2e.laboratorio@asilo.gt',   password: 'E2eDemo1234', rol: 'laboratorio' },
      { nombre: 'E2E Farmacia',          email: 'e2e.farmacia@asilo.gt',      password: 'E2eDemo1234', rol: 'farmacia' },
      { nombre: 'E2E Enfermero',         email: 'e2e.enfermero@asilo.gt',     password: 'E2eDemo1234', rol: 'enfermero' }
    ];
    for (const u of usuarios) await asegurarUsuario(adminToken, u);
    mgToken  = await login('e2e.medicogeneral@asilo.gt', 'E2eDemo1234');
    cfToken  = await login('e2e.coordinador@asilo.gt',   'E2eDemo1234');
    meToken  = await login('e2e.especialista@asilo.gt',  'E2eDemo1234');
    labToken = await login('e2e.laboratorio@asilo.gt',   'E2eDemo1234');
    farToken = await login('e2e.farmacia@asilo.gt',      'E2eDemo1234');
    enfToken = await login('e2e.enfermero@asilo.gt',     'E2eDemo1234');
    idEnf = (await req('GET', `${API.auth}/api/auth/me`, { token: enfToken, esperarStatus: 200 })).data.id;
    idMg  = (await req('GET', `${API.auth}/api/auth/me`, { token: mgToken,  esperarStatus: 200 })).data.id;
    // id del especialista para asignar cita
    const me = await req('GET', `${API.auth}/api/auth/me`, { token: meToken, esperarStatus: 200 });
    idEsp = me.data.id;
    ok(`idEspecialista=${idEsp} idEnfermero=${idEnf}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 01 - crear paciente
  paso('crear paciente E2E (DPI unico por timestamp)');
  try {
    const dpi = String(Date.now()).padStart(13, '0').slice(-13);
    const r = await req('POST', `${API.pacientes}/api/pacientes`, {
      body: {
        nombres: 'E2E', apellidos: `Smoke ${new Date().toISOString().slice(0,10)}`,
        fechaNacimiento: '1945-01-01', genero: 'M', dpi,
        familiar: familiarE2E(String(TS + 1).padStart(13, '0').slice(-13))
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
      body: { idPaciente: pacienteId, especialidad: 'cardiologia-e2e', motivo: 'Smoke e2e', idEnfermero: idEnf },
      token: mgToken, esperarStatus: 201
    });
    solicitudId = r.data.id;
    ok(`solicitudId=${solicitudId} estado=${r.data.estado}`);
  } catch (e) { falla(e.message); return finalizar(); }

  // 03 - coordinador asigna cita
  paso('coordinador: PATCH /api/solicitudes/:id/asignar-cita');
  try {
    const r = await req('PATCH', `${API.pacientes}/api/solicitudes/${solicitudId}/asignar-cita`, {
      body: { fechaCita: diaFuturo(30), horaCita: '10:00', idMedicoEspecialista: idEsp },
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

  // 07 - prescripcion asociada a un medicamento PROPIO del smoke (antes usaba
  // el Losartan del inventario y le descontaba stock real)
  paso('especialista: POST /api/visitas/:id/prescripciones con idMedicamento');
  try {
    medE2E = (await req('POST', `${API.farmacia}/api/farmacia/medicamentos`, {
      body: { nombre: `E2E medicamento ${TS}`, presentacion: 'tableta (prueba e2e)', stock: 20, precioUnitario: 1.20 },
      token: farToken, esperarStatus: 201
    })).data;
    const med = medE2E;
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaId}/prescripciones`, {
      body: { medicamento: med.nombre, dosis: '1/24h', indicaciones: 'con agua', idMedicamento: med.id, cantidadPrescrita: 2 },
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

  // Caso 16: el especialista ve el resultado disponible en su visita.
  paso('caso 16: el especialista ve el examen disponible y lee el resultado');
  try {
    const v = (await req('GET', `${API.pacientes}/api/visitas/${visitaId}`, { token: meToken, esperarStatus: 200 })).data;
    const ex = (v.examenes || []).find(x => x.id === examenId);
    if (ex?.estado !== 'disponible') throw new Error(`examen en la visita: ${ex?.estado}`);
    const r = (await req('GET', `${API.laboratorio}/api/laboratorio/resultados/examen/${examenId}`, { token: meToken, esperarStatus: 200 })).data;
    if (r.valorTexto !== 'Dentro de rango (e2e)') throw new Error(`resultado: ${JSON.stringify(r)}`);
    ok(`examen ${examenId} disponible: "${r.valorTexto}"`);
  } catch (e) { falla(e.message); }

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
    cargoVisita = r.data.cargo;
    ok(`estado=${r.data.estado} cargo=${cargoVisita?.id} Q${cargoVisita?.monto}`);
  } catch (e) { falla(e.message); }

  // 12 - notificacion creada
  paso('notificaciones: existe una para este paciente');
  try {
    const r = await req('GET', `${API.notificaciones}/api/notificaciones?limit=20`, { token: adminToken, esperarStatus: 200 });
    const mia = r.data.find(n => n.idPaciente === pacienteId);
    if (!mia) throw new Error('no encontre notificacion del paciente');
    // Caso 10: log con estado enviada e ID del mensaje (sim-... en simulacion;
    // este smoke no se corre contra Brevo real).
    if (mia.estado !== 'enviada' || !mia.idMensajeProveedor) {
      throw new Error(`estado=${mia.estado} idMensajeProveedor=${mia.idMensajeProveedor}`);
    }
    ok(`id=${mia.id} estado=${mia.estado} idMensaje=${mia.idMensajeProveedor}`);
  } catch (e) { falla(e.message); }

  // 13 - estado de cuenta del paciente
  paso('financiero: GET /api/financiero/estado-cuenta/:idPaciente');
  try {
    const r = await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacienteId}`, { token: adminToken, esperarStatus: 200 });
    ok(`saldoTotal=${r.data.saldoTotal} alerta=${r.data.alerta?.nivel || 'ninguna'}`);
  } catch (e) { falla(e.message); }

  // 14 - GET /api/auth/me (no estaba probado antes)
  paso('auth: GET /api/auth/me devuelve el usuario del token');
  try {
    const r = await req('GET', `${API.auth}/api/auth/me`, { token: adminToken, esperarStatus: 200 });
    if (!r.data?.email) throw new Error('respuesta sin email');
    ok(`email=${r.data.email} rol=${r.data.rol}`);
  } catch (e) { falla(e.message); }

  // 15 - PUT /api/pacientes/:id (actualizar paciente)
  paso('pacientes: PUT /:id actualiza telefono');
  try {
    const original = (await req('GET', `${API.pacientes}/api/pacientes/${pacienteId}`, { token: adminToken, esperarStatus: 200 })).data;
    const r = await req('PUT', `${API.pacientes}/api/pacientes/${pacienteId}`, {
      body: { ...original, telefono: '55559999' },
      token: adminToken, esperarStatus: 200
    });
    if (r.data.telefono !== '55559999') throw new Error(`telefono no se actualizo: ${r.data.telefono}`);
    ok(`telefono actualizado a 55559999`);
  } catch (e) { falla(e.message); }

  // 16 - DELETE /api/pacientes/:id = borrado logico (crea uno propio)
  paso('pacientes: DELETE /:id desactiva un paciente propio (borrado logico)');
  try {
    const dpi = String(Date.now() + 1).padStart(13, '0').slice(-13);
    const creado = await req('POST', `${API.pacientes}/api/pacientes`, {
      body: {
        nombres: 'E2E', apellidos: 'Descartable',
        fechaNacimiento: '1950-01-01', genero: 'M', dpi, familiar: familiarE2E(dpi)
      },
      token: adminToken, esperarStatus: 201
    });
    // Caso 6: sin motivo -> 400; con motivo y fecha quedan guardados.
    await req('DELETE', `${API.pacientes}/api/pacientes/${creado.data.id}`, { token: adminToken, esperarStatus: 400 });
    const hoyGt = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
    const r = await req('DELETE', `${API.pacientes}/api/pacientes/${creado.data.id}`, {
      body: { motivoEgreso: 'Traslado con su familia (e2e)', fechaEgreso: hoyGt }, token: adminToken, esperarStatus: 200 });
    if (r.data.activo !== false) throw new Error('DELETE no dejo activo=false');
    if (r.data.motivoEgreso !== 'Traslado con su familia (e2e)' || String(r.data.fechaEgreso).slice(0, 10) !== hoyGt) {
      throw new Error(`egreso: ${r.data.fechaEgreso} / ${r.data.motivoEgreso}`);
    }
    const check = await req('GET', `${API.pacientes}/api/pacientes/${creado.data.id}`, { token: adminToken, esperarStatus: 200 });
    if (check.data.activo !== false) throw new Error('el registro no se conserva desactivado');
    const lista = (await req('GET', `${API.pacientes}/api/pacientes`, { token: adminToken, esperarStatus: 200 })).data;
    if (lista.some(p => p.id === creado.data.id)) throw new Error('el listado por defecto muestra al desactivado');
    if (check.data.motivoEgreso !== 'Traslado con su familia (e2e)') throw new Error('la ficha no muestra el motivo de egreso');
    ok(`id=${creado.data.id} egreso ${hoyGt} con motivo; sin motivo 400; conservado y fuera del listado`);
  } catch (e) { falla(e.message); }

  // 17..19 - los 7 reportes en JSON, PDF y Excel
  const tiposReporte = [
    'entradas', 'cobros-por-rango', 'pagos-fundacion',
    'costos-por-paciente', 'analisis-medico', 'examenes', 'medicamentos-aplicados'
  ];
  const hoy = new Date().toISOString().slice(0, 10);
  const haceUnAnio = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const qs = `desde=${haceUnAnio}&hasta=${hoy}`;

  paso('reportes: los 7 tipos en JSON (status 200, columnas presentes)');
  try {
    for (const tipo of tiposReporte) {
      const r = await req('GET', `${API.reportes}/api/reportes/${tipo}?${qs}&formato=json`, { token: adminToken, esperarStatus: 200 });
      if (!Array.isArray(r.data?.columnas) || r.data.columnas.length === 0) {
        throw new Error(`${tipo}: respuesta sin columnas`);
      }
    }
    ok(`${tiposReporte.length} reportes JSON validos`);
  } catch (e) { falla(e.message); }

  paso('reportes: los 7 tipos en PDF (content-type application/pdf, no vacio)');
  try {
    for (const tipo of tiposReporte) {
      const url = `${API.reportes}/api/reportes/${tipo}?${qs}&formato=pdf`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (resp.status !== 200) throw new Error(`${tipo} PDF status ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      if (!/application\/pdf/i.test(ct)) throw new Error(`${tipo} PDF content-type=${ct}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 500) throw new Error(`${tipo} PDF demasiado pequeno (${buf.length}B)`);
      if (buf.slice(0, 4).toString() !== '%PDF') throw new Error(`${tipo} PDF sin firma %PDF`);
    }
    ok(`${tiposReporte.length} reportes PDF validos`);
  } catch (e) { falla(e.message); }

  paso('reportes: los 7 tipos en Excel (content-type xlsx, no vacio)');
  try {
    for (const tipo of tiposReporte) {
      const url = `${API.reportes}/api/reportes/${tipo}?${qs}&formato=excel`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (resp.status !== 200) throw new Error(`${tipo} Excel status ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      if (!/spreadsheetml/i.test(ct)) throw new Error(`${tipo} Excel content-type=${ct}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 500) throw new Error(`${tipo} Excel demasiado pequeno (${buf.length}B)`);
      // Los .xlsx son zip; empiezan con "PK"
      if (buf.slice(0, 2).toString() !== 'PK') throw new Error(`${tipo} Excel sin firma PK`);
    }
    ok(`${tiposReporte.length} reportes Excel validos`);
  } catch (e) { falla(e.message); }

  // 22..31 - reglas y RBAC que antes solo cubrian las pruebas unitarias
  let solicitudCancelable;

  paso('RN-02: segunda solicitud activa misma especialidad -> 409');
  try {
    const a = await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'rn02-e2e', motivo: 'RN-02 e2e', idEnfermero: idEnf },
      token: mgToken, esperarStatus: 201
    });
    solicitudCancelable = a.data.id;
    const dup = await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'rn02-e2e', motivo: 'duplicada', idEnfermero: idEnf },
      token: mgToken, esperarStatus: 409
    });
    // Caso 9: el rechazo indica cual es la solicitud activa que lo bloquea.
    if (dup.data?.solicitudActiva?.id !== solicitudCancelable) {
      throw new Error(`409 sin la solicitud activa: ${JSON.stringify(dup.data)}`);
    }
    ok(`primera id=${solicitudCancelable}, duplicada rechazada senalando la activa (${dup.data.solicitudActiva.estado})`);
  } catch (e) { falla(e.message); }

  paso('medico_general: PATCH /api/solicitudes/:id/cancelar -> cancelada');
  try {
    const r = await req('PATCH', `${API.pacientes}/api/solicitudes/${solicitudCancelable}/cancelar`, {
      token: mgToken, esperarStatus: 200
    });
    if (r.data.estado !== 'cancelada') throw new Error(`estado=${r.data.estado}`);
    ok('estado=cancelada');
  } catch (e) { falla(e.message); }

  paso('inmutabilidad: cancelar una solicitud ya cancelada -> 409');
  try {
    await req('PATCH', `${API.pacientes}/api/solicitudes/${solicitudCancelable}/cancelar`, {
      token: mgToken, esperarStatus: 409
    });
    ok('rechazo correcto');
  } catch (e) { falla(e.message); }

  paso('RBAC backend: farmacia crea paciente, laboratorio crea medicamento, especialista dispensa -> 403');
  try {
    await req('POST', `${API.pacientes}/api/pacientes`, { body: {}, token: farToken, esperarStatus: 403 });
    await req('POST', `${API.farmacia}/api/farmacia/medicamentos`, { body: {}, token: labToken, esperarStatus: 403 });
    await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, { body: {}, token: meToken, esperarStatus: 403 });
    ok('3 rechazos 403');
  } catch (e) { falla(e.message); }

  paso('paciente activo: desactivado no recibe solicitudes (409); reactivado si');
  try {
    await req('DELETE', `${API.pacientes}/api/pacientes/${pacienteId}`, { token: adminToken, esperarStatus: 200, body: { motivoEgreso: 'Prueba e2e de paciente activo' } });
    const r = await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'inactivo-e2e', motivo: 'paciente desactivado', idEnfermero: idEnf },
      token: mgToken, esperarStatus: 409
    });
    await req('PATCH', `${API.pacientes}/api/pacientes/${pacienteId}/reactivar`, { token: adminToken, esperarStatus: 200 });
    ok(String(r.data?.error || '').slice(0, 60));
  } catch (e) { falla(e.message); }

  paso('auth: GET /api/auth/usuarios?rol=medico_especialista (coordinador ok, farmacia 403)');
  try {
    const r = await req('GET', `${API.auth}/api/auth/usuarios?rol=medico_especialista`, { token: cfToken, esperarStatus: 200 });
    if (!r.data.some(u => u.id === idEsp)) throw new Error('el especialista e2e no aparece en la lista');
    if (r.data.some(u => 'passwordHash' in u)) throw new Error('la respuesta expone passwordHash');
    await req('GET', `${API.auth}/api/auth/usuarios`, { token: farToken, esperarStatus: 403 });
    ok(`${r.data.length} especialistas, sin passwordHash`);
  } catch (e) { falla(e.message); }

  paso('laboratorio: costo del examen = precio del catalogo con RN-09');
  try {
    const precios = (await req('GET', `${API.laboratorio}/api/laboratorio/precios`, { token: meToken, esperarStatus: 200 })).data;
    const p = precios.find(x => x.tipo === 'Hematologia completa');
    if (!p) throw new Error('no hay precio para Hematologia completa');
    const esperado = Math.round(p.precioBase * 0.8 * 100) / 100;
    if (p.precioConDescuento !== esperado) throw new Error(`catalogo: ${p.precioConDescuento} != ${esperado}`);
    const c = (await req('GET', `${API.laboratorio}/api/laboratorio/examenes/${examenId}/costo`, { token: labToken, esperarStatus: 200 })).data;
    if (c.total !== esperado) throw new Error(`costo del examen: ${c.total} != ${esperado}`);
    ok(`base=${p.precioBase} total=${c.total}`);
  } catch (e) { falla(e.message); }

  // Precio PROPIO del smoke (antes hacia PUT sobre precios[0], un precio real).
  // Se reutiliza entre corridas porque los precios no se pueden borrar.
  paso('laboratorio: PUT /precios/:id sobre un precio propio (admin 200, laboratorio 403)');
  try {
    const TIPO_E2E = 'E2E examen (no usar)';
    const precios = (await req('GET', `${API.laboratorio}/api/laboratorio/precios`, { token: adminToken, esperarStatus: 200 })).data;
    let p = precios.find(x => x.tipo === TIPO_E2E);
    if (!p) {
      p = (await req('POST', `${API.laboratorio}/api/laboratorio/precios`, {
        body: { tipo: TIPO_E2E, precioBase: 10 }, token: adminToken, esperarStatus: 201
      })).data;
    }
    const r = await req('PUT', `${API.laboratorio}/api/laboratorio/precios/${p.id}`, {
      body: { tipo: p.tipo, precioBase: p.precioBase }, token: adminToken, esperarStatus: 200
    });
    if (r.data.precioBase !== p.precioBase) throw new Error('el precio cambio');
    await req('PUT', `${API.laboratorio}/api/laboratorio/precios/${p.id}`, {
      body: { tipo: p.tipo, precioBase: p.precioBase }, token: labToken, esperarStatus: 403
    });
    ok(`${p.tipo} = ${p.precioBase}`);
  } catch (e) { falla(e.message); }

  // Caso 15 sobre una visita propia y el precio propio del smoke.
  paso('caso 15: el examen queda con su costo con descuento al ordenarlo; cambiar el catalogo no lo altera');
  try {
    const TIPO_E2E = 'E2E examen (no usar)';
    const p = (await req('GET', `${API.laboratorio}/api/laboratorio/precios`, { token: adminToken, esperarStatus: 200 })).data
      .find(x => x.tipo === TIPO_E2E);
    const dpi = String(TS + 15).padStart(13, '0').slice(-13);
    const pac = (await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { nombres: 'E2E', apellidos: 'Caso 15', fechaNacimiento: '1948-05-05', genero: 'M', dpi,
              familiar: familiarE2E(String(TS + 16).padStart(13, '0').slice(-13)) },
      token: adminToken, esperarStatus: 201
    })).data;
    const sol = (await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pac.id, especialidad: 'caso15-e2e', motivo: 'caso 15', idEnfermero: idEnf }, token: mgToken, esperarStatus: 201
    })).data;
    await req('PATCH', `${API.pacientes}/api/solicitudes/${sol.id}/asignar-cita`, {
      body: { fechaCita: diaFuturo(32), horaCita: '08:00', idMedicoEspecialista: idEsp }, token: cfToken, esperarStatus: 200
    });
    const vis = (await req('POST', `${API.pacientes}/api/solicitudes/${sol.id}/convertir-a-visita`, { token: meToken, esperarStatus: 201 })).data;
    // Tipo sin precio en el catalogo -> 409, no se ordena.
    await req('POST', `${API.pacientes}/api/visitas/${vis.id}/examenes`, {
      body: { tipo: `E2E sin precio ${TS}` }, token: meToken, esperarStatus: 409
    });
    const ex = (await req('POST', `${API.pacientes}/api/visitas/${vis.id}/examenes`, {
      body: { tipo: TIPO_E2E }, token: meToken, esperarStatus: 201
    })).data;
    const base = p.precioBase, desc = Math.round(base * 0.2 * 100) / 100, costo = Math.round((base - desc) * 100) / 100;
    if (ex.precioBase !== base || ex.descuento !== desc || ex.costo !== costo) {
      throw new Error(`orden: ${ex.precioBase}/${ex.descuento}/${ex.costo} != ${base}/${desc}/${costo}`);
    }
    await req('PUT', `${API.laboratorio}/api/laboratorio/precios/${p.id}`, {
      body: { tipo: p.tipo, precioBase: base + 5 }, token: adminToken, esperarStatus: 200
    });
    let c;
    try {
      c = (await req('GET', `${API.laboratorio}/api/laboratorio/examenes/${ex.id}/costo`, { token: labToken, esperarStatus: 200 })).data;
    } finally {
      await req('PUT', `${API.laboratorio}/api/laboratorio/precios/${p.id}`, {
        body: { tipo: p.tipo, precioBase: base }, token: adminToken, esperarStatus: 200
      });
    }
    if (c.total !== costo || !c.registradoAlOrdenar) throw new Error(`costo tras cambiar catalogo: ${JSON.stringify(c)}`);
    ok(`examen ${ex.id}: ${base} - ${desc} = ${costo}; catalogo a ${base + 5} y sigue ${c.total}`);
  } catch (e) { falla(e.message); }

  paso('financiero: POST /gastos (admin 201 y aparece en el listado, farmacia 403)');
  try {
    const concepto = `E2E gasto ${Date.now()}`;
    await req('POST', `${API.financiero}/api/financiero/gastos`, {
      body: { concepto, monto: 1, categoria: 'otros' }, token: adminToken, esperarStatus: 201
    });
    const lista = (await req('GET', `${API.financiero}/api/financiero/gastos`, { token: adminToken, esperarStatus: 200 })).data;
    if (!lista.some(g => g.concepto === concepto)) throw new Error('el gasto no aparece en el listado');
    await req('POST', `${API.financiero}/api/financiero/gastos`, {
      body: { concepto, monto: 1 }, token: farToken, esperarStatus: 403
    });
    ok('gasto Q1 registrado');
  } catch (e) { falla(e.message); }

  paso('financiero: POST /pagos-fundacion (admin 201 y aparece en el listado)');
  try {
    const concepto = `E2E pago fundacion ${Date.now()}`;
    conceptoPagoE2E = concepto;
    await req('POST', `${API.financiero}/api/financiero/pagos-fundacion`, {
      body: { concepto, monto: 1 }, token: adminToken, esperarStatus: 201
    });
    const lista = (await req('GET', `${API.financiero}/api/financiero/pagos-fundacion`, { token: adminToken, esperarStatus: 200 })).data;
    if (!lista.some(p => p.concepto === concepto)) throw new Error('el pago no aparece en el listado');
    ok('pago Q1 registrado');
  } catch (e) { falla(e.message); }

  // 32..39 - borrado logico, cuentas desactivadas y auditoria. Todo sobre
  // registros creados aqui mismo.
  let pacB, visitaB, rxB;

  paso('paciente B propio con visita y prescripcion pendiente (preparacion)');
  try {
    const dpi = String(TS + 7).padStart(13, '0').slice(-13);
    pacB = (await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { nombres: 'E2E', apellidos: `Inactivable ${new Date().toISOString().slice(0, 10)}`,
              fechaNacimiento: '1944-04-04', genero: 'F', dpi, familiar: familiarE2E(String(TS + 8).padStart(13, '0').slice(-13)) },
      token: adminToken, esperarStatus: 201
    })).data;
    const sol = (await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacB.id, especialidad: 'inactivable-e2e', motivo: 'e2e borrado logico', idEnfermero: idEnf },
      token: mgToken, esperarStatus: 201
    })).data;
    await req('PATCH', `${API.pacientes}/api/solicitudes/${sol.id}/asignar-cita`, {
      body: { fechaCita: diaFuturo(31), horaCita: '09:00', idMedicoEspecialista: idEsp }, token: cfToken, esperarStatus: 200
    });
    visitaB = (await req('POST', `${API.pacientes}/api/solicitudes/${sol.id}/convertir-a-visita`, { token: meToken, esperarStatus: 201 })).data;
    rxB = (await req('POST', `${API.pacientes}/api/visitas/${visitaB.id}/prescripciones`, {
      body: { medicamento: medE2E.nombre, dosis: '1/24h', idMedicamento: medE2E.id, cantidadPrescrita: 5 }, token: meToken, esperarStatus: 201
    })).data;
    ok(`paciente=${pacB.id} visita=${visitaB.id} prescripcion=${rxB.id}`);
  } catch (e) { falla(e.message); return finalizar(); }

  paso('paciente desactivado: no recibe examenes ni dispensaciones (409); listados lo ocultan');
  try {
    await req('DELETE', `${API.pacientes}/api/pacientes/${pacB.id}`, { token: adminToken, esperarStatus: 200, body: { motivoEgreso: 'Prueba e2e de borrado logico' } });
    await req('POST', `${API.pacientes}/api/visitas/${visitaB.id}/examenes`, {
      body: { tipo: 'Uroanalisis' }, token: meToken, esperarStatus: 409
    });
    const d = await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: rxB.id, cantidad: 1 }, token: farToken, esperarStatus: 409
    });
    const visibles = (await req('GET', `${API.pacientes}/api/pacientes`, { token: mgToken, esperarStatus: 200 })).data;
    if (visibles.some(p => p.id === pacB.id)) throw new Error('el listado por defecto muestra al desactivado');
    await req('GET', `${API.pacientes}/api/pacientes?incluirInactivos=true`, { token: mgToken, esperarStatus: 403 });
    const todos = (await req('GET', `${API.pacientes}/api/pacientes?incluirInactivos=true`, { token: adminToken, esperarStatus: 200 })).data;
    if (!todos.some(p => p.id === pacB.id && p.activo === false)) throw new Error('admin no ve al desactivado');
    ok(String(d.data?.error || '').slice(0, 60));
  } catch (e) { falla(e.message); }

  paso('medicamento propio desactivado: no se dispensa (409) y sale del inventario');
  try {
    await req('PATCH', `${API.pacientes}/api/pacientes/${pacB.id}/reactivar`, { token: adminToken, esperarStatus: 200 });
    await req('DELETE', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}`, { token: farToken, esperarStatus: 200 });
    const inv = (await req('GET', `${API.farmacia}/api/farmacia/medicamentos`, { token: farToken, esperarStatus: 200 })).data;
    if (inv.some(m => m.id === medE2E.id)) throw new Error('el inventario muestra el medicamento desactivado');
    await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: rxB.id, cantidad: 1 }, token: farToken, esperarStatus: 409
    });
    await req('PATCH', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}/reactivar`, { token: farToken, esperarStatus: 403 });
    await req('PATCH', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}/reactivar`, { token: adminToken, esperarStatus: 200 });
    const disp = await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: rxB.id, cantidad: 1 }, token: farToken, esperarStatus: 201
    });
    ok(`reactivado y dispensado, costo=${disp.data.costoTotal}`);
  } catch (e) { falla(e.message); }

  paso('cuenta desactivada: login 403, admin no se desactiva a si mismo (409), reactivada vuelve a entrar');
  try {
    const email = `e2e.desactivable.${TS}@asilo.gt`;
    const u = (await req('POST', `${API.auth}/api/auth/register`, {
      body: { nombre: 'E2E Desactivable', email, password: 'E2eDemo1234', rol: 'enfermero' },
      token: adminToken, esperarStatus: 201
    })).data;
    await req('PATCH', `${API.auth}/api/auth/usuarios/${u.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    const l = await req('POST', `${API.auth}/api/auth/login`, { body: { email, password: 'E2eDemo1234' }, esperarStatus: 403 });
    const yo = (await req('GET', `${API.auth}/api/auth/me`, { token: adminToken, esperarStatus: 200 })).data;
    await req('PATCH', `${API.auth}/api/auth/usuarios/${yo.id}/desactivar`, { token: adminToken, esperarStatus: 409 });
    await req('PATCH', `${API.auth}/api/auth/usuarios/${u.id}/desactivar`, { token: farToken, esperarStatus: 403 });
    await req('PATCH', `${API.auth}/api/auth/usuarios/${u.id}/reactivar`, { token: adminToken, esperarStatus: 200 });
    await req('POST', `${API.auth}/api/auth/login`, { body: { email, password: 'E2eDemo1234' }, esperarStatus: 200 });
    // Se deja desactivada: es una cuenta de prueba que nadie debe usar.
    await req('PATCH', `${API.auth}/api/auth/usuarios/${u.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    ok(String(l.data?.error || '').slice(0, 50));
  } catch (e) { falla(e.message); }

  paso('donante propio desactivado: donacion 409; reactivado: 201');
  try {
    const dn = (await req('POST', `${API.financiero}/api/financiero/donantes`, {
      body: { nombre: `E2E donante ${TS}` }, token: adminToken, esperarStatus: 201
    })).data;
    await req('PATCH', `${API.financiero}/api/financiero/donantes/${dn.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    await req('POST', `${API.financiero}/api/financiero/donaciones`, {
      body: { idDonante: dn.id, monto: 1, concepto: 'E2E' }, token: adminToken, esperarStatus: 409
    });
    await req('PATCH', `${API.financiero}/api/financiero/donantes/${dn.id}/reactivar`, { token: adminToken, esperarStatus: 200 });
    await req('POST', `${API.financiero}/api/financiero/donaciones`, {
      body: { idDonante: dn.id, monto: 1, concepto: 'E2E' }, token: adminToken, esperarStatus: 201
    });
    await req('PATCH', `${API.financiero}/api/financiero/donantes/${dn.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    ok(`donante=${dn.id}`);
  } catch (e) { falla(e.message); }

  paso('auditoria: el paciente B tiene crear, desactivar y reactivar con usuario, IP, modulo y JSON');
  try {
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 24 * 3600 * 1000).toISOString();
    const hasta = new Date(hoy.getTime() + 60 * 1000).toISOString();
    const qs = `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&entidad=paciente&idEntidad=${pacB.id}`;
    const filas = (await req('GET', `${API.reportes}/api/auditoria?${qs}`, { token: adminToken, esperarStatus: 200 })).data;
    const acciones = filas.map(f => f.accion).sort().join(',');
    if (acciones !== 'crear,desactivar,reactivar') throw new Error(`acciones=${acciones}`);
    if (!filas.every(f => f.usuario === ADMIN.email)) throw new Error('usuario de auditoria incorrecto');
    // Caso 24: IP, modulo y datos anteriores / nuevos en JSON
    const des = filas.find(f => f.accion === 'desactivar');
    if (!des.ip || des.modulo !== 'pacientes') throw new Error(`ip=${des.ip} modulo=${des.modulo}`);
    if (des.datosAnteriores?.activo !== true || des.datosNuevos?.activo !== false || des.datosNuevos?.motivoEgreso !== 'Prueba e2e de borrado logico') {
      throw new Error(`antes=${JSON.stringify(des.datosAnteriores)} despues=${JSON.stringify(des.datosNuevos)}`);
    }
    const cre = filas.find(f => f.accion === 'crear');
    if (cre.datosAnteriores !== null || cre.datosNuevos?.id !== pacB.id) throw new Error('crear sin datosNuevos');
    ok(`${acciones}; ip=${des.ip} modulo=${des.modulo} activo true -> false`);
  } catch (e) { falla(e.message); }

  // Caso 24: por el nginx la auditoria guarda la IP del cliente tal como la
  // ve nginx (la misma que ve el servicio en una llamada directa), nunca la
  // del contenedor de nginx ni un X-Forwarded-For inventado.
  paso('caso 24: por el nginx se audita la IP del cliente; X-Forwarded-For inventado se ignora');
  try {
    const falsa = '203.0.113.66';
    const modificar = async (base, telefono) => {
      const r = await fetch(`${base}/api/pacientes/${pacB.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'X-Forwarded-For': falsa },
        body: JSON.stringify({ ...pacB, telefono })
      });
      if (r.status !== 200) throw new Error(`PUT por ${base} -> ${r.status} ${await r.text()}`);
    };
    await modificar(`${NGINX}/pacientes`, '55550101');
    await modificar(API.pacientes, '55550102');
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const qs = `desde=${encodeURIComponent(desde)}&entidad=paciente&idEntidad=${pacB.id}`;
    const filas = (await req('GET', `${NGINX}/reportes/api/auditoria?${qs}`, { token: adminToken, esperarStatus: 200 })).data
      .filter(f => f.accion === 'modificar');
    const porNginx = filas.find(f => f.datosNuevos?.telefono === '55550101');
    const directo = filas.find(f => f.datosNuevos?.telefono === '55550102');
    if (!porNginx || !directo) throw new Error('no encontre las dos modificaciones en la auditoria');
    if (porNginx.ip === falsa || directo.ip === falsa) throw new Error('se registro la IP inventada');
    if (!porNginx.ip || porNginx.ip !== directo.ip) {
      throw new Error(`ip por nginx=${porNginx.ip} directa=${directo.ip}: se esta guardando la IP del proxy`);
    }
    ok(`por nginx y directo: ip=${porNginx.ip} (la del cliente); ${falsa} ignorada`);
  } catch (e) { falla(e.message); }

  paso('auditoria: dispensacion, visita y solicitud registradas; RBAC y validacion');
  try {
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const qs = e => `desde=${encodeURIComponent(desde)}&entidad=${e}&limite=50`;
    const disp = (await req('GET', `${API.reportes}/api/auditoria?${qs('dispensacion')}`, { token: adminToken, esperarStatus: 200 })).data;
    if (!disp.some(f => (f.detalle || '').includes(`prescripcion #${rxB.id}`))) throw new Error('falta la dispensacion');
    const vis = (await req('GET', `${API.reportes}/api/auditoria?${qs('visita')}&idEntidad=${visitaId}`, { token: adminToken, esperarStatus: 200 })).data;
    if (!vis.some(f => f.detalle === 'completada')) throw new Error('falta completar visita');
    const sol = (await req('GET', `${API.reportes}/api/auditoria?${qs('solicitud')}&idEntidad=${solicitudId}`, { token: adminToken, esperarStatus: 200 })).data;
    if (sol.map(f => f.accion).sort().join(',') !== 'crear,modificar') throw new Error('faltan crear/asignar cita de la solicitud');
    await req('GET', `${API.reportes}/api/auditoria`, { token: farToken, esperarStatus: 403 });
    await req('GET', `${API.reportes}/api/auditoria?entidad=planeta`, { token: adminToken, esperarStatus: 400 });
    ok('3 entidades verificadas, 403 y 400 correctos');
  } catch (e) { falla(e.message); }

  // 40..41 - caso 19 del plan del SQA: cargo automatico al cerrar la visita
  paso('caso 19: el cierre genero un cargo desglosado con descuento en la cuenta');
  try {
    if (!cargoVisita) throw new Error('el cierre no devolvio cargo');
    const cta = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacienteId}`, { token: adminToken, esperarStatus: 200 })).data;
    const c = cta.cargos.find(x => x.id === cargoVisita.id);
    if (!c) throw new Error('el cargo no aparece en el estado de cuenta');
    if (c.origen !== 'visita' || c.idVisita !== visitaId) throw new Error(`origen=${c.origen} idVisita=${c.idVisita}`);
    const rubros = c.detalles.map(d => d.rubro);
    for (const r of ['consulta', 'laboratorio', 'farmacia']) if (!rubros.includes(r)) throw new Error(`falta el rubro ${r}`);
    for (const d of c.detalles) {
      if (!(d.descuento > 0) || Math.abs(d.montoBase - d.descuento - d.monto) > 0.011) {
        throw new Error(`linea sin descuento RN-09: ${JSON.stringify(d)}`);
      }
    }
    const suma = Math.round(c.detalles.reduce((a, d) => a + d.monto, 0) * 100) / 100;
    if (suma !== c.monto) throw new Error(`detalle ${suma} != total ${c.monto}`);
    if (cta.saldoCargos < c.monto) throw new Error(`el saldo ${cta.saldoCargos} no incluye el cargo ${c.monto}`);
    ok(`cargo ${c.id} = ${c.detalles.map(d => d.rubro + ' ' + d.monto).join(' + ')} = Q${c.monto}`);
  } catch (e) { falla(e.message); }

  paso('caso 19: reintentar el cierre -> 409 y sigue habiendo un solo cargo de la visita');
  try {
    await req('POST', `${API.pacientes}/api/visitas/${visitaId}/completar`, { token: meToken, esperarStatus: 409 });
    const cta = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacienteId}`, { token: adminToken, esperarStatus: 200 })).data;
    const deLaVisita = cta.cargos.filter(x => x.idVisita === visitaId && x.origen === 'visita');
    if (deLaVisita.length !== 1) throw new Error(`cargos de la visita = ${deLaVisita.length}`);
    ok('sin duplicado');
  } catch (e) { falla(e.message); }

  // 42..45 - caso 18: despacho parcial (rxB: 5 prescritas, ya se entrego 1)
  paso('caso 18: tras entregar 1 de 5 la prescripcion queda parcial y la visita acumula el costo');
  try {
    const v = (await req('GET', `${API.pacientes}/api/visitas/${visitaB.id}`, { token: meToken, esperarStatus: 200 })).data;
    const p = v.prescripciones.find(x => x.id === rxB.id);
    if (p.estado !== 'parcial' || p.cantidadEntregada !== 1 || p.cantidadPrescrita !== 5) {
      throw new Error(`estado=${p.estado} entregado=${p.cantidadEntregada}/${p.cantidadPrescrita}`);
    }
    if (Number(v.costoFarmacia) !== 0.96) throw new Error(`costoFarmacia=${v.costoFarmacia}`);
    const pend = (await req('GET', `${API.farmacia}/api/farmacia/prescripciones/pendientes/paciente/${pacB.id}`, { token: farToken, esperarStatus: 200 })).data;
    if (!pend.some(x => x.id === rxB.id && x.cantidadRestante === 4)) throw new Error('farmacia no la lista como pendiente con 4 restantes');
    ok('parcial 1/5, costo visita Q0.96');
  } catch (e) { falla(e.message); }

  paso('caso 18: entregar mas de lo que falta (5 de 4) -> 409 sin tocar el stock');
  try {
    const antes = (await req('GET', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}`, { token: farToken, esperarStatus: 200 })).data.stock;
    await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: rxB.id, cantidad: 5 }, token: farToken, esperarStatus: 409
    });
    const despues = (await req('GET', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}`, { token: farToken, esperarStatus: 200 })).data.stock;
    if (antes !== despues) throw new Error(`el stock cambio: ${antes} -> ${despues}`);
    ok(`stock intacto (${despues})`);
  } catch (e) { falla(e.message); }

  paso('caso 14: cerrar la visita B sin diagnostico ni observaciones -> 400, campos faltantes e incompleta');
  try {
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaB.id}/completar`, { token: meToken, esperarStatus: 400 });
    if (JSON.stringify(r.data.camposFaltantes) !== '["diagnostico","observaciones"]') {
      throw new Error(`camposFaltantes=${JSON.stringify(r.data.camposFaltantes)}`);
    }
    const v = (await req('GET', `${API.pacientes}/api/visitas/${visitaB.id}`, { token: meToken, esperarStatus: 200 })).data;
    if (v.estado !== 'incompleta') throw new Error(`estado=${v.estado}`);
    const cta = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacB.id}`, { token: adminToken, esperarStatus: 200 })).data;
    if (cta.cargos.some(c => c.idVisita === visitaB.id)) throw new Error('se genero cargo de una visita rechazada');
    ok('incompleta, sin cargo');
  } catch (e) { falla(e.message); }

  paso('caso 18/19: cerrar la visita B cobra lo entregado hasta ese momento');
  try {
    await req('PATCH', `${API.pacientes}/api/visitas/${visitaB.id}`, {
      body: { diagnostico: 'E2E dx B', observaciones: 'E2E obs B' }, token: meToken, esperarStatus: 200
    });
    const r = await req('POST', `${API.pacientes}/api/visitas/${visitaB.id}/completar`, { token: meToken, esperarStatus: 200 });
    const far = r.data.cargo.detalles.filter(d => d.rubro === 'farmacia').reduce((a, d) => a + d.monto, 0);
    if (Math.round(far * 100) / 100 !== 0.96) throw new Error(`farmacia en el cargo = ${far}`);
    ok(`cargo ${r.data.cargo.id} Q${r.data.cargo.monto} (farmacia 0.96)`);
  } catch (e) { falla(e.message); }

  paso('caso 20: abonos al cargo de la visita B nunca dejan saldo negativo');
  try {
    const cta = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacB.id}`, { token: adminToken, esperarStatus: 200 })).data;
    const c = cta.cargos.find(x => x.idVisita === visitaB.id && x.origen === 'visita');
    const exceso = await req('POST', `${API.financiero}/api/financiero/cargos/${c.id}/abonos`, {
      body: { monto: Math.round((c.saldo + 0.01) * 100) / 100 }, token: adminToken, esperarStatus: 409
    });
    const a1 = (await req('POST', `${API.financiero}/api/financiero/cargos/${c.id}/abonos`, {
      body: { monto: 20, concepto: 'E2E abono' }, token: adminToken, esperarStatus: 201 })).data;
    if (a1.estado !== 'parcial' || Math.abs(a1.saldo - (c.saldo - 20)) > 0.001) throw new Error(`tras abono 1: ${a1.estado} ${a1.saldo}`);
    const a2 = (await req('POST', `${API.financiero}/api/financiero/cargos/${c.id}/abonos`, {
      body: { monto: a1.saldo, concepto: 'E2E abono' }, token: adminToken, esperarStatus: 201 })).data;
    if (a2.estado !== 'pagado' || a2.saldo !== 0) throw new Error(`tras abono 2: ${a2.estado} ${a2.saldo}`);
    abonosE2E = { idCargo: c.id, total: Math.round(c.saldo * 100) / 100 };
    await req('POST', `${API.financiero}/api/financiero/cargos/${c.id}/abonos`, { body: { monto: 1 }, token: adminToken, esperarStatus: 409 });
    await req('POST', `${API.financiero}/api/financiero/cargos/${c.id}/abonos`, { body: { monto: 1 }, token: cfToken, esperarStatus: 403 });
    const despues = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacB.id}`, { token: adminToken, esperarStatus: 200 })).data;
    if (despues.saldoCargos < 0) throw new Error(`saldo negativo ${despues.saldoCargos}`);
    ok(`exceso rechazado (${String(exceso.data.error).slice(0, 40)}...); 20 + ${a1.saldo} -> pagado; saldo ${despues.saldoCargos}`);
  } catch (e) { falla(e.message); }

  paso('caso 18: completar la entrega despues del cierre -> dispensada y cargo complementario');
  try {
    const d = (await req('POST', `${API.farmacia}/api/farmacia/dispensaciones`, {
      body: { idPrescripcion: rxB.id, cantidad: 4 }, token: farToken, esperarStatus: 201
    })).data;
    if (d.estadoPrescripcion !== 'dispensada' || d.cantidadRestante !== 0) throw new Error(`estado=${d.estadoPrescripcion}`);
    if (!d.cargoComplementario) throw new Error('no se genero el cargo complementario');
    const cta = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacB.id}`, { token: adminToken, esperarStatus: 200 })).data;
    const comp = cta.cargos.find(c => c.id === d.cargoComplementario.id);
    if (!comp || comp.origen !== 'dispensacion' || comp.monto !== 3.84) throw new Error(`cargo complementario ${JSON.stringify(comp)}`);
    const v = (await req('GET', `${API.pacientes}/api/visitas/${visitaB.id}`, { token: meToken, esperarStatus: 200 })).data;
    if (Number(v.costoFarmacia) !== 4.8) throw new Error(`costoFarmacia=${v.costoFarmacia}`);
    ok('cargo complementario Q3.84; costo farmacia de la visita Q4.80');
  } catch (e) { falla(e.message); }

  // Casos 5, 7, 12 y 13 sobre el paciente y la solicitud principales del smoke.
  paso('caso 5: alta sin familiar o con familiar incompleto -> 400 con los campos que faltan');
  try {
    const base = { nombres: 'E2E', apellidos: 'Sin familiar', fechaNacimiento: '1950-02-02', genero: 'F' };
    const sin = await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { ...base, dpi: String(TS + 21).padStart(13, '0').slice(-13) }, token: adminToken, esperarStatus: 400
    });
    const inc = await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { ...base, dpi: String(TS + 22).padStart(13, '0').slice(-13),
              familiar: { ...familiarE2E(String(TS + 23).padStart(13, '0').slice(-13)), telefono: '', direccion: '' } },
      token: adminToken, esperarStatus: 400
    });
    const faltan = inc.data?.camposFaltantes || [];
    if (!faltan.includes('telefono') || !faltan.includes('direccion')) throw new Error(`camposFaltantes=${JSON.stringify(faltan)}`);
    ok(`sin familiar: ${(sin.data?.camposFaltantes || []).length} campos; incompleto: ${faltan.join(', ')}`);
  } catch (e) { falla(e.message); }

  paso('caso 5: el paciente E2E tiene familiar responsable completo y ficha medica 1:1');
  let fichaE2E;
  try {
    const p = (await req('GET', `${API.pacientes}/api/pacientes/${pacienteId}`, { token: adminToken, esperarStatus: 200 })).data;
    if (!p.familiar || p.familiar.parentesco !== 'hijo(a)' || !p.familiar.direccion) throw new Error(`familiar=${JSON.stringify(p.familiar)}`);
    if (!p.ficha || p.ficha.idPaciente !== pacienteId) throw new Error(`ficha=${JSON.stringify(p.ficha)}`);
    fichaE2E = p.ficha;
    ok(`familiar id=${p.familiar.id}, ficha id=${p.ficha.id}`);
  } catch (e) { falla(e.message); }

  paso('caso 13: la visita quedo en_atencion vinculada a la ficha del paciente');
  try {
    const v = (await req('GET', `${API.pacientes}/api/visitas/${visitaId}`, { token: meToken, esperarStatus: 200 })).data;
    if (!fichaE2E || v.idFichaMedica !== fichaE2E.id) throw new Error(`idFichaMedica=${v.idFichaMedica}, ficha=${fichaE2E?.id}`);
    ok(`visita ${v.id} -> ficha ${v.idFichaMedica}`);
  } catch (e) { falla(e.message); }

  paso('caso 7: la solicitud lleva al enfermero; sin el o con un no-enfermero -> 400; enfermero y especialista no crean (403)');
  try {
    const sol = (await req('GET', `${API.pacientes}/api/solicitudes/${solicitudId}`, { token: mgToken, esperarStatus: 200 })).data;
    if (sol.idEnfermero !== idEnf) throw new Error(`idEnfermero=${sol.idEnfermero}`);
    const cuerpo = { idPaciente: pacienteId, especialidad: 'caso7-e2e', motivo: 'caso 7' };
    await req('POST', `${API.pacientes}/api/solicitudes`, { body: cuerpo, token: mgToken, esperarStatus: 400 });
    await req('POST', `${API.pacientes}/api/solicitudes`, { body: { ...cuerpo, idEnfermero: idEsp }, token: mgToken, esperarStatus: 400 });
    await req('POST', `${API.pacientes}/api/solicitudes`, { body: { ...cuerpo, idEnfermero: idEnf }, token: enfToken, esperarStatus: 403 });
    await req('POST', `${API.pacientes}/api/solicitudes`, { body: { ...cuerpo, idEnfermero: idEnf }, token: meToken, esperarStatus: 403 });
    ok(`solicitud ${solicitudId} con enfermero ${idEnf}; 2 x 400 y 2 x 403`);
  } catch (e) { falla(e.message); }

  paso('caso 12: asignar cita dejo aviso interno al medico general y al enfermero; marcar leido');
  try {
    const avisosMg  = (await req('GET', `${API.pacientes}/api/avisos`, { token: mgToken,  esperarStatus: 200 })).data;
    const avisosEnf = (await req('GET', `${API.pacientes}/api/avisos`, { token: enfToken, esperarStatus: 200 })).data;
    const aMg  = avisosMg.find(a => a.idSolicitud === solicitudId && a.tipo === 'cita_asignada');
    const aEnf = avisosEnf.find(a => a.idSolicitud === solicitudId && a.tipo === 'cita_asignada');
    if (!aMg || !aEnf) throw new Error(`aviso medico=${!!aMg} enfermero=${!!aEnf}`);
    // Un usuario no marca avisos ajenos.
    await req('PATCH', `${API.pacientes}/api/avisos/${aMg.id}/leido`, { token: enfToken, esperarStatus: 404 });
    const leido = (await req('PATCH', `${API.pacientes}/api/avisos/${aMg.id}/leido`, { token: mgToken, esperarStatus: 200 })).data;
    if (!leido.leido) throw new Error('no quedo leido');
    const noLeidos = (await req('GET', `${API.pacientes}/api/avisos?noLeidos=true`, { token: mgToken, esperarStatus: 200 })).data;
    if (noLeidos.some(a => a.id === aMg.id)) throw new Error('el leido sigue en noLeidos');
    ok(`aviso ${aMg.id}: "${aMg.mensaje.slice(0, 50)}..."`);
  } catch (e) { falla(e.message); }

  // Caso 21: dos pacientes propios con cuotas emitidas que vencen en fechas
  // controladas (una con 5 dias de mora, otra con 40).
  paso('caso 21: cuota con 5 dias de mora -> naranja, con 40 dias -> roja; pagada sale del panel');
  try {
    const diaGt = dias => new Date(Date.now() - 6 * 3600e3 - dias * 864e5).toISOString().slice(0, 10);
    const crearPac = async (n, ap) => (await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { nombres: 'E2E', apellidos: ap, fechaNacimiento: '1946-06-06', genero: 'F',
              dpi: String(TS + n).padStart(13, '0').slice(-13), familiar: familiarE2E(String(TS + n + 1).padStart(13, '0').slice(-13)) },
      token: adminToken, esperarStatus: 201
    })).data;
    const pacN = await crearPac(31, 'Alerta naranja');
    const pacR = await crearPac(33, 'Alerta roja');
    const qN = (await req('POST', `${API.financiero}/api/financiero/cuotas`, {
      body: { idPaciente: pacN.id, mes: 1, anio: 2025, monto: 300, fechaVencimiento: diaGt(5) }, token: adminToken, esperarStatus: 201
    })).data;
    await req('POST', `${API.financiero}/api/financiero/cuotas`, {
      body: { idPaciente: pacR.id, mes: 2, anio: 2025, monto: 300, fechaVencimiento: diaGt(40) }, token: adminToken, esperarStatus: 201
    });
    if (qN.estado !== 'pendiente') throw new Error(`cuota emitida en estado ${qN.estado}`);
    // Emitir dos veces el mismo periodo -> 409; coordinador no emite (403).
    await req('POST', `${API.financiero}/api/financiero/cuotas`, {
      body: { idPaciente: pacN.id, mes: 1, anio: 2025, monto: 300 }, token: adminToken, esperarStatus: 409
    });
    await req('POST', `${API.financiero}/api/financiero/cuotas`, {
      body: { idPaciente: pacN.id, mes: 3, anio: 2025, monto: 300 }, token: cfToken, esperarStatus: 403
    });
    const panel = (await req('GET', `${API.financiero}/api/financiero/alertas`, { token: adminToken, esperarStatus: 200 })).data;
    const aN = panel.find(a => a.idPaciente === pacN.id), aR = panel.find(a => a.idPaciente === pacR.id);
    if (aN?.alerta?.nivel !== 'naranja' || aN.alerta.diasMoraMax !== 5) throw new Error(`naranja: ${JSON.stringify(aN?.alerta)}`);
    if (aR?.alerta?.nivel !== 'roja' || aR.alerta.diasMoraMax !== 40) throw new Error(`roja: ${JSON.stringify(aR?.alerta)}`);
    if (panel.findIndex(a => a.alerta.nivel === 'naranja') < panel.findLastIndex(a => a.alerta.nivel === 'roja')) {
      throw new Error('el panel no lista las rojas primero');
    }
    const ec = (await req('GET', `${API.financiero}/api/financiero/estado-cuenta/${pacN.id}`, { token: adminToken, esperarStatus: 200 })).data;
    if (ec.alerta?.nivel !== 'naranja' || ec.cuotas[0]?.diasMora !== 5) throw new Error(`estado de cuenta: ${JSON.stringify(ec.alerta)}`);
    await req('GET', `${API.financiero}/api/financiero/alertas`, { token: enfToken, esperarStatus: 403 });
    // Pagar la cuota vencida quita la alerta.
    await req('POST', `${API.financiero}/api/financiero/pagos-cuota`, {
      body: { idPaciente: pacN.id, mes: 1, anio: 2025 }, token: adminToken, esperarStatus: 201
    });
    const panel2 = (await req('GET', `${API.financiero}/api/financiero/alertas`, { token: cfToken, esperarStatus: 200 })).data;
    if (panel2.some(a => a.idPaciente === pacN.id)) throw new Error('la cuota pagada sigue en alertas');
    ok(`naranja=${pacN.id} (5 d), roja=${pacR.id} (40 d); pagada sale del panel`);
  } catch (e) { falla(e.message); }

  // Caso 23: entradas con SQL contra la BD real. Se guardan como texto
  // literal o se rechazan; las tablas siguen intactas.
  paso('caso 23: inyeccion SQL en login, pacientes, laboratorio y reportes -> texto literal o 400/401');
  try {
    for (const email of ["admin@asilo.gt' OR '1'='1", "' OR 1=1 --", "admin@asilo.gt'; DROP TABLE usuarios;--"]) {
      const r = await req('POST', `${API.auth}/api/auth/login`, { body: { email, password: "x' OR '1'='1" } });
      // 429 tambien es rechazo: al repetir el smoke en menos de 15 min el
      // limite de intentos bloquea estos mismos correos.
      if (![400, 401, 429].includes(r.status)) throw new Error(`login con ${email} -> ${r.status}`);
    }
    const malicioso = "Robert'); DROP TABLE pacientes;--";
    const pac = (await req('POST', `${API.pacientes}/api/pacientes`, {
      body: { nombres: malicioso, apellidos: "O'Brien E2E", fechaNacimiento: '1949-09-09', genero: 'M',
              dpi: String(TS + 41).padStart(13, '0').slice(-13), padecimientos: "1; DELETE FROM visitas_medicas WHERE 1=1;--",
              familiar: { ...familiarE2E(String(TS + 42).padStart(13, '0').slice(-13)), direccion: "' OR ''='" } },
      token: adminToken, esperarStatus: 201
    })).data;
    const leido = (await req('GET', `${API.pacientes}/api/pacientes/${pac.id}`, { token: adminToken, esperarStatus: 200 })).data;
    if (leido.nombres !== malicioso || leido.apellidos !== "O'Brien E2E" || leido.familiar?.direccion !== "' OR ''='") {
      throw new Error(`no se guardo literal: ${leido.nombres} / ${leido.familiar?.direccion}`);
    }
    const lista = (await req('GET', `${API.pacientes}/api/pacientes`, { token: adminToken, esperarStatus: 200 })).data;
    if (!lista.some(p => p.id === pacienteId)) throw new Error('la tabla pacientes perdio registros');
    const idMalo = await req('GET', `${API.pacientes}/api/pacientes/${encodeURIComponent('1 OR 1=1')}`, { token: adminToken });
    if (idMalo.status !== 404 && idMalo.status !== 400) throw new Error(`GET /pacientes/1 OR 1=1 -> ${idMalo.status}`);
    const dpiMalo = await req('GET', `${API.laboratorio}/api/laboratorio/pacientes/dpi/${encodeURIComponent("' OR '1'='1")}`, { token: labToken });
    if (dpiMalo.status !== 404 && dpiMalo.status !== 400) throw new Error(`dpi malicioso -> ${dpiMalo.status}`);
    for (const q of [`desde=${encodeURIComponent("2026-01-01' OR '1'='1")}`, `hasta=${encodeURIComponent('2026-12-31; DROP TABLE cargos_servicio;--')}`,
                     `idPaciente=${encodeURIComponent('1 OR 1=1')}`, `formato=${encodeURIComponent("pdf' --")}`]) {
      await req('GET', `${API.reportes}/api/reportes/costos-por-paciente?${q}`, { token: adminToken, esperarStatus: 400 });
    }
    await req('GET', `${API.reportes}/api/reportes/${encodeURIComponent("examenes' OR 1=1--")}`, { token: adminToken, esperarStatus: 400 });
    await req('GET', `${API.reportes}/api/reportes/costos-por-paciente`, { token: adminToken, esperarStatus: 200 });
    ok(`paciente ${pac.id} guardado literal; 3 logins 401; 5 reportes 400; id/dpi maliciosos ${idMalo.status}/${dpiMalo.status}`);
  } catch (e) { falla(e.message); }

  // Caso 22: el Excel trae formulas reales (lo verifica a fondo la prueba
  // unitaria; aqui se confirma sobre el servicio desplegado).
  paso('caso 22: el Excel de costos por paciente tiene formulas SUM en los totales');
  try {
    const r = await fetch(`${API.reportes}/api/reportes/costos-por-paciente?formato=excel`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const ws = wb.worksheets[0];
    const total = ws.getRow(ws.rowCount);
    const f = total.getCell(8).value;
    if (!f || !/^SUM\(H6:H\d+\)$/.test(f.formula || '')) throw new Error(`total sin formula: ${JSON.stringify(f)}`);
    const fila = ws.getCell('H6').value;
    if (!fila?.formula) throw new Error(`total por fila sin formula: ${JSON.stringify(fila)}`);
    ok(`${f.formula} = ${f.result}; fila 6: ${fila.formula}`);
  } catch (e) { falla(e.message); }

  // Bloque 3: "hasta" inclusivo. Un rango hoy-a-hoy (dia de Guatemala)
  // trae lo que este smoke registro hoy; ayer-a-ayer no lo trae.
  paso('reportes: rango hoy-a-hoy incluye lo registrado hoy en los 7 reportes; ayer-a-ayer no');
  try {
    const dia = offset => new Date(Date.now() - 6 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
    const hoy = dia(0), ayer = dia(-1);
    const rep = async (tipo, d, h) => (await req('GET', `${API.reportes}/api/reportes/${tipo}?desde=${d}&hasta=${h}`,
      { token: adminToken, esperarStatus: 200 })).data.filas;
    const esperado = {
      'costos-por-paciente': f => f.idPaciente === pacienteId,
      'analisis-medico': f => f.especialidad === 'cardiologia-e2e',
      'cobros-por-rango': f => f.concepto === 'Cuota 1/2025' && /E2E Alerta naranja/.test(f.paciente),
      'pagos-fundacion': f => f.concepto === conceptoPagoE2E,
      'entradas': f => f.concepto.startsWith('Cuota 1/2025 - E2E Alerta naranja'),
      'examenes': f => f.idExamen === examenId,
      'medicamentos-aplicados': f => f.medicamento === medE2E.nombre
    };
    for (const [tipo, criterio] of Object.entries(esperado)) {
      if (!(await rep(tipo, hoy, hoy)).some(criterio)) throw new Error(`${tipo} ${hoy}..${hoy} no incluye el registro de hoy`);
    }
    if ((await rep('examenes', ayer, ayer)).some(esperado.examenes)) throw new Error('ayer-a-ayer incluye un examen de hoy');
    // Los abonos a cargos son ingresos: aparecen en cobros y en entradas por su monto exacto.
    let abonos = '';
    if (abonosE2E) {
      const suma = (filas, prefijo) => Math.round(filas.filter(f => f.concepto.startsWith(prefijo)).reduce((a, f) => a + Number(f.monto), 0) * 100) / 100;
      const enCobros = suma(await rep('cobros-por-rango', hoy, hoy), `Abono a cargo #${abonosE2E.idCargo}:`);
      const enEntradas = suma(await rep('entradas', hoy, hoy), `Abono a cargo #${abonosE2E.idCargo} -`);
      if (enCobros !== abonosE2E.total || enEntradas !== abonosE2E.total)
        throw new Error(`abonos del cargo ${abonosE2E.idCargo}: Q${abonosE2E.total} pagados, cobros Q${enCobros}, entradas Q${enEntradas}`);
      abonos = `; abonos del cargo ${abonosE2E.idCargo} (Q${abonosE2E.total}) en cobros y entradas`;
    }
    ok(`7 reportes ${hoy}..${hoy} con registros propios; ${ayer}..${ayer} sin ellos${abonos}`);
  } catch (e) { falla(e.message); }

  // RF-42: regla de contrasena del Analisis (8+, letra y numero) en el alta
  // y en el cambio; el restablecimiento lo cubre el paso siguiente.
  paso('RF-42: contrasena de 8+ con letra y numero en alta y cambio; mensajes claros');
  try {
    const email = `e2e.clave.${TS}@asilo.gt`;
    const alta = p => req('POST', `${API.auth}/api/auth/register`, {
      body: { nombre: 'E2E Clave', email, password: p, rol: 'enfermero' }, token: adminToken });
    for (const [p, msg] of [['Abc1234', /al menos 8 caracteres/], ['abcdefgh', /al menos un número/], ['12345678', /al menos una letra/]]) {
      const r = await alta(p);
      if (r.status !== 400 || !msg.test(r.data?.error)) throw new Error(`alta con "${p}" -> ${r.status} ${JSON.stringify(r.data)}`);
    }
    const creada = await alta('Clave2026');
    if (creada.status !== 201) throw new Error(`alta valida -> ${creada.status}`);
    const tk = await login(email, 'Clave2026');
    const cambiar = body => req('POST', `${NGINX}/auth/api/auth/cambiar-password`, { body, token: tk });
    const debil = await cambiar({ passwordActual: 'Clave2026', passwordNueva: 'nueva' });
    if (debil.status !== 400 || !/al menos 8 caracteres/.test(debil.data?.error)) throw new Error(`cambio debil -> ${JSON.stringify(debil.data)}`);
    const malaActual = await cambiar({ passwordActual: 'Otra2026x', passwordNueva: 'Nueva2026' });
    if (malaActual.status !== 400) throw new Error(`actual incorrecta -> ${malaActual.status}`);
    await req('POST', `${NGINX}/auth/api/auth/cambiar-password`, { body: { passwordActual: 'Clave2026', passwordNueva: 'Nueva2026' }, token: tk, esperarStatus: 200 });
    await req('POST', `${NGINX}/auth/api/auth/cambiar-password`, { body: {}, esperarStatus: 401 });
    await login(email, 'Nueva2026');
    await req('PATCH', `${API.auth}/api/auth/usuarios/${creada.data.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    ok(`3 altas debiles 400 con mensaje; cambio debil 400, con la actual mala 400, valido 200; login con la nueva`);
  } catch (e) { falla(e.message); }

  // Limite de intentos: 5 fallos por IP real + usuario en 15 min (login y
  // /recuperar). Correos unicos por corrida; nada queda en la base.
  paso('limite: 5 fallos de login por IP + usuario y la sexta -> 429; /recuperar igual; X-Forwarded-For inventado no lo evita');
  try {
    const email = `e2e.limite.${TS}@asilo.gt`;
    const intentar = (base, extra = {}) => fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ email, password: 'Incorrecta1' }) });
    for (let i = 1; i <= 5; i++) {
      const r = await intentar(`${NGINX}/auth`);
      if (r.status !== 401) throw new Error(`fallo ${i} -> ${r.status}`);
    }
    const sexto = await intentar(`${NGINX}/auth`);
    const cuerpo = await sexto.json();
    if (sexto.status !== 429 || !/Demasiados intentos/.test(cuerpo.error) || !sexto.headers.get('retry-after')) {
      throw new Error(`sexto -> ${sexto.status} ${JSON.stringify(cuerpo)}`);
    }
    // Cambiar X-Forwarded-For no da otra IP: nginx agrega la real y el servicio solo confia en el.
    const disfrazado = await intentar(`${NGINX}/auth`, { 'X-Forwarded-For': '203.0.113.99' });
    if (disfrazado.status !== 429) throw new Error(`con X-Forwarded-For inventado -> ${disfrazado.status}`);
    // Otro usuario desde la misma IP sigue pudiendo entrar.
    await login('e2e.medicogeneral@asilo.gt', 'E2eDemo1234');
    const correoRec = `e2e.limite.rec.${TS}@asilo.gt`;
    for (let i = 1; i <= 5; i++) {
      await req('POST', `${NGINX}/auth/api/auth/recuperar`, { body: { email: correoRec }, esperarStatus: 200 });
    }
    const rec = await req('POST', `${NGINX}/auth/api/auth/recuperar`, { body: { email: correoRec } });
    if (rec.status !== 429) throw new Error(`recuperar sexta -> ${rec.status}`);
    ok(`login: 5 x 401 y 429 (Retry-After ${sexto.headers.get('retry-after')} s), tambien con XFF inventado; recuperar: 5 x 200 y 429`);
  } catch (e) { falla(e.message); }

  // RF-42 / UC-10.4: recuperacion de contrasena sobre una cuenta propia.
  paso('RF-42: recuperar contrasena (misma respuesta exista o no), enlace de un uso y login con la nueva');
  try {
    const cuenta = { nombre: 'E2E Recuperacion', email: `e2e.recupera.${TS}@asilo.gt`, password: 'E2eDemo1234', rol: 'enfermero' };
    await asegurarUsuario(adminToken, cuenta);
    const pedir = email => req('POST', `${NGINX}/auth/api/auth/recuperar`, { body: { email }, esperarStatus: 200 });
    const [real, falsa] = [await pedir(cuenta.email), await pedir(`no.existe.${TS}@asilo.gt`)];
    if (JSON.stringify(real.data) !== JSON.stringify(falsa.data)) throw new Error('la respuesta revela si el correo existe');
    await req('POST', `${API.auth}/api/auth/recuperar`, { body: { email: 'no-es-correo' }, esperarStatus: 400 });
    // El correo sale en segundo plano: se espera a que aparezca en el log.
    let notif;
    for (let i = 0; i < 20 && !notif; i++) {
      const log = (await req('GET', `${API.notificaciones}/api/notificaciones?limit=50`, { token: adminToken, esperarStatus: 200 })).data;
      // Se espera a que deje de estar pendiente (el envio corre despues de insertar).
      notif = log.find(n => n.destinatarioEmail === cuenta.email && n.tipoEvento === 'recuperacion_password' && n.estado !== 'pendiente');
      if (!notif) await new Promise(r => setTimeout(r, 250));
    }
    if (!notif || notif.estado !== 'enviada' || !notif.idMensajeProveedor) throw new Error(`log: ${JSON.stringify(notif)}`);
    if (/restablecer=/.test(JSON.stringify(notif))) throw new Error('el log de la API expone el enlace');
    await req('POST', `${API.auth}/api/auth/restablecer`, { body: { token: 'A'.repeat(43), password: 'Nueva12345' }, esperarStatus: 400 });
    const token = enlaceRecuperacionLocal(cuenta.email);
    let detalle = 'sin docker local: flujo completo cubierto solo por la prueba unitaria';
    if (token) {
      await req('POST', `${NGINX}/auth/api/auth/restablecer`, { body: { token, password: '123' }, esperarStatus: 400 });
      await req('POST', `${NGINX}/auth/api/auth/restablecer`, { body: { token, password: 'Nueva12345' }, esperarStatus: 200 });
      await req('POST', `${API.auth}/api/auth/restablecer`, { body: { token, password: 'Otra12345' }, esperarStatus: 400 });
      await req('POST', `${API.auth}/api/auth/login`, { body: { email: cuenta.email, password: cuenta.password }, esperarStatus: 401 });
      await login(cuenta.email, 'Nueva12345');
      detalle = 'enlace usado una vez; la contrasena vieja ya no entra y la nueva si';
    }
    // Auditoria: solicitud (y cambio) registrados para esa cuenta.
    const yo = (await req('GET', `${API.auth}/api/auth/usuarios?incluirInactivos=true`, { token: adminToken, esperarStatus: 200 })).data
      .find(u => u.email === cuenta.email);
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const aud = (await req('GET', `${API.reportes}/api/auditoria?desde=${encodeURIComponent(desde)}&entidad=usuario&idEntidad=${yo.id}`,
      { token: adminToken, esperarStatus: 200 })).data.map(a => a.detalle).join(' | ');
    if (!/recuperacion de contrasena solicitada/.test(aud) || (token && !/contrasena restablecida/.test(aud))) throw new Error(`auditoria: ${aud}`);
    // La cuenta de prueba no queda activa.
    await req('PATCH', `${API.auth}/api/auth/usuarios/${yo.id}/desactivar`, { token: adminToken, esperarStatus: 200 });
    ok(`respuesta identica; notificacion #${notif.id} ${notif.idMensajeProveedor}; ${detalle}`);
  } catch (e) { falla(e.message); }

  paso('limpieza: desactivar el medicamento propio del smoke');
  try {
    await req('DELETE', `${API.farmacia}/api/farmacia/medicamentos/${medE2E.id}`, { token: farToken, esperarStatus: 200 });
    ok(`medicamento ${medE2E.id} desactivado`);
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
