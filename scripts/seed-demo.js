#!/usr/bin/env node
/*
 * Siembra de datos de demostracion para el Sistema Asilo Cabeza de
 * Algodon. Idempotente: se puede correr dos veces sin duplicar nada.
 *
 * Que carga:
 *  - 1 usuario por rol clave (contrasenas de demo en scripts/README.md).
 *  - 6 pacientes con familiarEmail para disparar notificaciones reales.
 *  - 2 medicamentos extra (los 3 base los crea farmacia-service).
 *  - 1 solicitud en cada estado: pendiente_asignacion, cita_asignada,
 *    en_atencion, completada, cancelada (con sus visitas y
 *    prescripciones donde corresponda).
 *  - 1 donante + 1 donacion, 1 gasto operativo, 1 pago a fundacion,
 *    1 cargo + 1 cuota pagada.
 *
 * Uso:
 *   npm run seed:demo                                # desde la raiz
 *   BASE_HOST=100.96.172.77 npm run seed:demo        # desde laptop al servidor
 *
 * Variables de entorno respetadas:
 *   BASE_HOST       host al que apuntar (default localhost)
 *   ADMIN_EMAIL     email del admin ya seedeado (default admin@asilo.gt)
 *   ADMIN_PASSWORD  password del admin         (default Admin12345)
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

// --- Credenciales de demo (documentadas tambien en scripts/README.md) ---
const USUARIOS = [
  { nombre: 'Dra. Marcela General',    email: 'medico.general@asilo.gt',     password: 'Demo1234', rol: 'medico_general' },
  { nombre: 'Dr. Rodrigo Especialista', email: 'especialista@asilo.gt',       password: 'Demo1234', rol: 'medico_especialista' },
  { nombre: 'Lic. Ana Coordinadora',    email: 'coordinador@asilo.gt',        password: 'Demo1234', rol: 'coordinador_fundacion' },
  { nombre: 'Enf. Patricia Rivera',    email: 'enfermeria@asilo.gt',         password: 'Demo1234', rol: 'enfermero' },
  { nombre: 'Farmacia Central',        email: 'farmacia@asilo.gt',           password: 'Demo1234', rol: 'farmacia' },
  { nombre: 'Laboratorio Central',     email: 'laboratorio@asilo.gt',        password: 'Demo1234', rol: 'laboratorio' }
];

const PACIENTES = [
  { nombres: 'Rosa',    apellidos: 'Gomez Cruz',    fechaNacimiento: '1938-04-22', genero: 'F', dpi: '1111111110101', telefono: '55551111', familiarEmail: 'familia.gomez@example.com',    padecimientos: 'Diabetes, hipertension' },
  { nombres: 'Pedro',   apellidos: 'Lopez Mendez',  fechaNacimiento: '1942-02-15', genero: 'M', dpi: '2222222220101', telefono: '55552222', familiarEmail: 'familia.lopez@example.com',    padecimientos: 'Artritis' },
  { nombres: 'Dolores', apellidos: 'Herrera Diaz',  fechaNacimiento: '1935-11-05', genero: 'F', dpi: '3333333330101', telefono: '55553333', familiarEmail: 'familia.herrera@example.com',  padecimientos: 'Alzheimer temprano' },
  { nombres: 'Esteban', apellidos: 'Castillo Luna', fechaNacimiento: '1947-07-30', genero: 'M', dpi: '4444444440101', telefono: '55554444', familiarEmail: 'familia.castillo@example.com', padecimientos: 'EPOC' },
  { nombres: 'Lucia',   apellidos: 'Morales Paz',   fechaNacimiento: '1940-09-18', genero: 'F', dpi: '5555555550101', telefono: '55555555', familiarEmail: 'familia.morales@example.com',  padecimientos: 'Osteoporosis' },
  { nombres: 'Hector',  apellidos: 'Rodas Soto',    fechaNacimiento: '1933-01-10', genero: 'M', dpi: '6666666660101', telefono: '55556666', familiarEmail: 'familia.rodas@example.com',    padecimientos: 'Parkinson leve' }
];

const MEDICAMENTOS_EXTRA = [
  { nombre: 'Metformina',  presentacion: 'tableta 500mg', stock: 180, precioUnitario: 0.90 },
  { nombre: 'Levotiroxina', presentacion: 'tableta 50mcg', stock: 120, precioUnitario: 1.50 }
];

// -------- utilitarios ----------
async function peticion(method, url, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, ok: r.ok, data };
}

const log  = (msg) => console.log(`  · ${msg}`);
const warn = (msg) => console.warn(`  ! ${msg}`);
const paso = (msg) => console.log(`\n${msg}`);

async function login(email, password) {
  const r = await peticion('POST', `${API.auth}/api/auth/login`, { body: { email, password } });
  if (!r.ok) throw new Error(`Login ${email} fallo: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

// ----------- MAIN -----------
(async function main() {
  console.log(`Siembra apuntando a http://${BASE_HOST}\n`);

  paso('1) Login admin');
  const adminToken = await login(ADMIN.email, ADMIN.password);
  log('ok');

  paso('2) Usuarios de demo (1 por rol)');
  for (const u of USUARIOS) {
    const r = await peticion('POST', `${API.auth}/api/auth/register`, { body: u, token: adminToken });
    if (r.ok) log(`creado ${u.email} (${u.rol})`);
    else if (String(r.data?.error || '').includes('ya existe')) log(`existe ${u.email}`);
    else warn(`${u.email}: ${JSON.stringify(r.data)}`);
  }

  paso('3) Pacientes');
  const porDpi = {};
  const existentes = (await peticion('GET', `${API.pacientes}/api/pacientes`, { token: adminToken })).data || [];
  existentes.forEach(p => (porDpi[p.dpi] = p));
  for (const p of PACIENTES) {
    if (porDpi[p.dpi]) { log(`existe ${p.nombres} ${p.apellidos}`); continue; }
    const r = await peticion('POST', `${API.pacientes}/api/pacientes`, { body: p, token: adminToken });
    if (r.ok) {
      porDpi[p.dpi] = r.data;
      log(`creado ${r.data.id} ${p.nombres} ${p.apellidos}`);
    } else warn(`${p.dpi}: ${JSON.stringify(r.data)}`);
  }

  paso('4) Medicamentos extra');
  const medsExistentes = (await peticion('GET', `${API.farmacia}/api/farmacia/medicamentos`, { token: adminToken })).data || [];
  const nombresMed = new Set(medsExistentes.map(m => m.nombre.toLowerCase()));
  for (const m of MEDICAMENTOS_EXTRA) {
    if (nombresMed.has(m.nombre.toLowerCase())) { log(`existe ${m.nombre}`); continue; }
    const r = await peticion('POST', `${API.farmacia}/api/farmacia/medicamentos`, { body: m, token: adminToken });
    if (r.ok) log(`creado ${m.nombre}`); else warn(`${m.nombre}: ${JSON.stringify(r.data)}`);
  }
  const todosMeds = (await peticion('GET', `${API.farmacia}/api/farmacia/medicamentos`, { token: adminToken })).data;
  const losartan = todosMeds.find(m => m.nombre.toLowerCase().startsWith('losartan'));

  paso('5) Tokens de los roles de demo');
  const tokenMG = await login('medico.general@asilo.gt', 'Demo1234');
  const tokenCF = await login('coordinador@asilo.gt',    'Demo1234');
  const tokenME = await login('especialista@asilo.gt',   'Demo1234');
  const tokenLB = await login('laboratorio@asilo.gt',    'Demo1234');
  log('tokens listos');

  // Para asegurar que haya una solicitud en cada estado para la demo,
  // asignamos a cada estado un paciente distinto. Si ya hay una activa
  // para esa combinacion paciente+especialidad, se omite (RN-02).
  const asignaciones = [
    { paciente: 'Rosa',   especialidad: 'geriatria',    objetivo: 'pendiente_asignacion' },
    { paciente: 'Pedro',  especialidad: 'traumatologia', objetivo: 'cita_asignada'       },
    { paciente: 'Dolores',especialidad: 'neurologia',   objetivo: 'en_atencion'          },
    { paciente: 'Esteban',especialidad: 'cardiologia',  objetivo: 'completada'           },
    { paciente: 'Lucia',  especialidad: 'oftalmologia', objetivo: 'cancelada'            }
  ];

  paso('6) Solicitudes de demo en cada estado');
  const idEspecialista = USUARIOS.findIndex(u => u.rol === 'medico_especialista') >= 0
    ? (await peticion('GET', `${API.auth}/api/auth/me`, { token: tokenME })).data?.id
    : null;

  const todasSol = (await peticion('GET', `${API.pacientes}/api/solicitudes`, { token: adminToken })).data || [];

  for (const a of asignaciones) {
    const paciente = Object.values(porDpi).find(p => p.nombres === a.paciente);
    if (!paciente) { warn(`no encontre paciente ${a.paciente}`); continue; }

    // Omite si ya existe UNA solicitud (de cualquier estado) para la combinacion
    const existente = todasSol.find(s =>
      s.idPaciente === paciente.id && s.especialidad === a.especialidad);
    if (existente) {
      log(`existe solicitud ${existente.id} (${a.paciente} / ${a.especialidad} / ${existente.estado})`);
      continue;
    }

    // 1) Crear como medico_general
    const r = await peticion('POST', `${API.pacientes}/api/solicitudes`, {
      body: { idPaciente: paciente.id, especialidad: a.especialidad,
              motivo: `Caso demo: ${a.objetivo}` },
      token: tokenMG
    });
    if (!r.ok) { warn(`crear ${a.paciente}/${a.especialidad}: ${JSON.stringify(r.data)}`); continue; }
    const sol = r.data;
    log(`creada ${sol.id} (${a.paciente} / ${a.especialidad})`);

    // 2) Avanzar segun el objetivo
    if (a.objetivo === 'pendiente_asignacion') continue;

    if (a.objetivo === 'cancelada') {
      await peticion('PATCH', `${API.pacientes}/api/solicitudes/${sol.id}/cancelar`, { token: tokenMG });
      log(`  -> cancelada`);
      continue;
    }

    const rAsig = await peticion('PATCH', `${API.pacientes}/api/solicitudes/${sol.id}/asignar-cita`, {
      body: { fechaCita: '2026-11-15', horaCita: '09:00',
              idMedicoEspecialista: idEspecialista || 1 },
      token: tokenCF
    });
    if (!rAsig.ok) { warn(`asignar: ${JSON.stringify(rAsig.data)}`); continue; }
    if (a.objetivo === 'cita_asignada') { log('  -> cita_asignada'); continue; }

    const rConv = await peticion('POST', `${API.pacientes}/api/solicitudes/${sol.id}/convertir-a-visita`, {
      token: tokenME
    });
    if (!rConv.ok) { warn(`convertir: ${JSON.stringify(rConv.data)}`); continue; }
    const visita = rConv.data;
    log(`  -> en_atencion (visita ${visita.id})`);

    if (a.objetivo === 'en_atencion') continue;

    // Completar: pide diagnostico + observaciones + un examen + una prescripcion
    await peticion('PATCH', `${API.pacientes}/api/visitas/${visita.id}`, {
      body: { diagnostico: 'Diagnostico demo', observaciones: 'Observaciones demo' },
      token: tokenME
    });
    await peticion('POST', `${API.pacientes}/api/visitas/${visita.id}/examenes`, {
      body: { tipo: 'Hematologia completa' }, token: tokenME
    });
    if (losartan) {
      await peticion('POST', `${API.pacientes}/api/visitas/${visita.id}/prescripciones`, {
        body: { medicamento: `${losartan.nombre} ${losartan.presentacion || ''}`.trim(),
                dosis: '1 cada 24h', indicaciones: 'Con agua',
                idMedicamento: losartan.id },
        token: tokenME
      });
    }
    await peticion('POST', `${API.pacientes}/api/visitas/${visita.id}/completar`, { token: tokenME });
    log('  -> completada');
  }

  paso('7) Financiero: donante + donacion + cargo + cuota + gasto');
  // Donante y donacion
  const donantes = (await peticion('GET', `${API.financiero}/api/financiero/donantes`, { token: adminToken })).data || [];
  let donante = donantes.find(d => d.nombre === 'Fundacion Amigos del Asilo');
  if (!donante) {
    const r = await peticion('POST', `${API.financiero}/api/financiero/donantes`, {
      body: { nombre: 'Fundacion Amigos del Asilo', telefono: '22334455', email: 'amigos@ong.gt' },
      token: adminToken
    });
    if (r.ok) { donante = r.data; log(`creado donante ${donante.id}`); }
    else warn(`donante: ${JSON.stringify(r.data)}`);
  } else log(`existe donante ${donante.id}`);

  if (donante) {
    const donaciones = (await peticion('GET', `${API.financiero}/api/financiero/donaciones`, { token: adminToken })).data || [];
    if (!donaciones.some(d => d.concepto === 'Aporte mensual demo')) {
      await peticion('POST', `${API.financiero}/api/financiero/donaciones`, {
        body: { idDonante: donante.id, monto: 2500, tipo: 'dinero', concepto: 'Aporte mensual demo' },
        token: adminToken
      });
      log('creada donacion Q2500');
    } else log('existe donacion demo');
  }

  // Cargo + cuota para la primera paciente
  const primerPaciente = Object.values(porDpi)[0];
  if (primerPaciente) {
    const ec = (await peticion('GET', `${API.financiero}/api/financiero/estado-cuenta/${primerPaciente.id}`, { token: adminToken })).data;
    if (ec && !ec.cargos.some(c => c.concepto === 'Consulta especialista (demo)')) {
      await peticion('POST', `${API.financiero}/api/financiero/cargos`, {
        body: { idPaciente: primerPaciente.id, concepto: 'Consulta especialista (demo)', monto: 450 },
        token: adminToken
      });
      log('cargo Q450 creado');
    } else log('existe cargo demo');

    const hoy = new Date();
    const mes = hoy.getMonth() + 1, anio = hoy.getFullYear();
    if (ec && !ec.cuotas.some(c => c.mes === mes && c.anio === anio)) {
      await peticion('POST', `${API.financiero}/api/financiero/pagos-cuota`, {
        body: { idPaciente: primerPaciente.id, mes, anio, monto: 800 },
        token: adminToken
      });
      log(`cuota ${mes}/${anio} Q800 pagada`);
    } else log(`existe cuota ${mes}/${anio}`);
  }

  // Gasto operativo + pago a fundacion
  const gastos = (await peticion('GET', `${API.financiero}/api/financiero/gastos`, { token: adminToken })).data || [];
  if (!gastos.some(g => g.concepto === 'Alimentos mensuales (demo)')) {
    await peticion('POST', `${API.financiero}/api/financiero/gastos`, {
      body: { concepto: 'Alimentos mensuales (demo)', monto: 1200, categoria: 'alimentacion' },
      token: adminToken
    });
    log('gasto Q1200 creado');
  } else log('existe gasto demo');

  const pagos = (await peticion('GET', `${API.financiero}/api/financiero/pagos-fundacion`, { token: adminToken })).data || [];
  if (!pagos.some(p => p.concepto === 'Honorarios especialistas (demo)')) {
    await peticion('POST', `${API.financiero}/api/financiero/pagos-fundacion`, {
      body: { monto: 3500, concepto: 'Honorarios especialistas (demo)' },
      token: adminToken
    });
    log('pago fundacion Q3500 creado');
  } else log('existe pago fundacion demo');

  // Opcional: registrar un resultado de laboratorio sobre un examen pendiente
  paso('8) Laboratorio: registrar resultado sobre un examen pendiente');
  const ordenes = (await peticion('GET', `${API.laboratorio}/api/laboratorio/ordenes-pendientes`, { token: tokenLB })).data || [];
  const una = ordenes[0];
  if (una) {
    const r = await peticion('POST', `${API.laboratorio}/api/laboratorio/resultados/examen/${una.idExamen}`, {
      body: { tipoResultado: 'texto', valorTexto: 'Resultado de demostracion - dentro de rango' },
      token: tokenLB
    });
    if (r.ok) log(`resultado examen ${una.idExamen} registrado`);
    else log(`skip resultado: ${r.data?.error || 'ok (quiza ya existia)'}`);
  } else log('sin ordenes pendientes');

  console.log('\nSiembra terminada. Puedes correr este script otra vez: no duplica datos.');
})().catch(err => {
  console.error(`\n✕ Error:`, err.message);
  process.exit(1);
});
