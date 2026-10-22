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
  let medE2E;   // medicamento propio: no se toca el stock del inventario real
  let cargoVisita; // cargo generado al cerrar la visita (caso 19)
  const TS = Date.now();

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
    ok(`id=${mia.id} estado=${mia.estado}`);
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
        fechaNacimiento: '1950-01-01', genero: 'M', dpi
      },
      token: adminToken, esperarStatus: 201
    });
    const r = await req('DELETE', `${API.pacientes}/api/pacientes/${creado.data.id}`, { token: adminToken, esperarStatus: 200 });
    if (r.data.activo !== false) throw new Error('DELETE no dejo activo=false');
    const check = await req('GET', `${API.pacientes}/api/pacientes/${creado.data.id}`, { token: adminToken, esperarStatus: 200 });
    if (check.data.activo !== false) throw new Error('el registro no se conserva desactivado');
    const lista = (await req('GET', `${API.pacientes}/api/pacientes`, { token: adminToken, esperarStatus: 200 })).data;
    if (lista.some(p => p.id === creado.data.id)) throw new Error('el listado por defecto muestra al desactivado');
    ok(`id=${creado.data.id} desactivado, conservado y fuera del listado`);
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
      body: { idPaciente: pacienteId, especialidad: 'rn02-e2e', motivo: 'RN-02 e2e' },
      token: mgToken, esperarStatus: 201
    });
    solicitudCancelable = a.data.id;
    await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'rn02-e2e', motivo: 'duplicada' },
      token: mgToken, esperarStatus: 409
    });
    ok(`primera id=${solicitudCancelable}, duplicada rechazada`);
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
    await req('DELETE', `${API.pacientes}/api/pacientes/${pacienteId}`, { token: adminToken, esperarStatus: 200 });
    const r = await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacienteId, especialidad: 'inactivo-e2e', motivo: 'paciente desactivado' },
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
              fechaNacimiento: '1944-04-04', genero: 'F', dpi },
      token: adminToken, esperarStatus: 201
    })).data;
    const sol = (await req('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: pacB.id, especialidad: 'inactivable-e2e', motivo: 'e2e borrado logico' },
      token: mgToken, esperarStatus: 201
    })).data;
    await req('PATCH', `${API.pacientes}/api/solicitudes/${sol.id}/asignar-cita`, {
      body: { fechaCita: '2026-12-02', horaCita: '09:00', idMedicoEspecialista: idEsp }, token: cfToken, esperarStatus: 200
    });
    visitaB = (await req('POST', `${API.pacientes}/api/solicitudes/${sol.id}/convertir-a-visita`, { token: meToken, esperarStatus: 201 })).data;
    rxB = (await req('POST', `${API.pacientes}/api/visitas/${visitaB.id}/prescripciones`, {
      body: { medicamento: medE2E.nombre, dosis: '1/24h', idMedicamento: medE2E.id, cantidadPrescrita: 5 }, token: meToken, esperarStatus: 201
    })).data;
    ok(`paciente=${pacB.id} visita=${visitaB.id} prescripcion=${rxB.id}`);
  } catch (e) { falla(e.message); return finalizar(); }

  paso('paciente desactivado: no recibe examenes ni dispensaciones (409); listados lo ocultan');
  try {
    await req('DELETE', `${API.pacientes}/api/pacientes/${pacB.id}`, { token: adminToken, esperarStatus: 200 });
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
    if (des.datosAnteriores?.activo !== true || des.datosNuevos?.activo !== false) {
      throw new Error(`antes=${JSON.stringify(des.datosAnteriores)} despues=${JSON.stringify(des.datosNuevos)}`);
    }
    const cre = filas.find(f => f.accion === 'crear');
    if (cre.datosAnteriores !== null || cre.datosNuevos?.id !== pacB.id) throw new Error('crear sin datosNuevos');
    ok(`${acciones}; ip=${des.ip} modulo=${des.modulo} activo true -> false`);
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
