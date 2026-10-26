/*
 * Auditoria SQA (26 oct 2026): verificacion independiente de los 25 casos del
 * plan contra el stack local (npm run test:sqa). Crea sus propios registros
 * "SQA ..."; el caso 20 inserta un paciente sin familiar y prueba el CHECK
 * con docker exec, asi que es SOLO para el stack local (nunca contra datos reales).
 */
/*
 * Verificacion independiente de los 25 casos del plan del SQA contra el
 * stack levantado. Crea sus propios registros ("SQA ..."). Entra por el
 * nginx (/svc/...) como el navegador; el caso 4 usa tambien los puertos.
 * Uso: node verificar_sqa.js <ruta-del-repo>
 */
const path = require('path');
const { execFileSync } = require('child_process');
const REPO = process.argv[2] || path.join(__dirname, '..');
const ExcelJS = require(path.join(REPO, 'node_modules', 'exceljs'));

const NG = 'http://localhost:8090/svc';
const B = s => `${NG}/${s}`;
const PUERTOS = { auth: 3000, farmacia: 3001, pacientes: 3002, laboratorio: 3003, financiero: 3004, reportes: 3005, notificaciones: 3006 };
const TS = Date.now();
const resultados = [];
const ctx = {};

async function req(method, url, { body, token, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
  const t = await r.text(); let data = t; try { data = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, data, headers: r.headers };
}
function exige(cond, msg) { if (!cond) throw new Error(msg); }
function st(r, esperado, que) { exige(r.status === esperado, `${que}: esperaba ${esperado}, recibio ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); return r.data; }
async function caso(id, nombre, fn) {
  try {
    const ev = await fn();
    const [estado, evidencia] = Array.isArray(ev) ? ev : ['OK', ev];
    resultados.push({ id, nombre, estado, evidencia });
  } catch (e) { resultados.push({ id, nombre, estado: 'FALLA', evidencia: e.message }); }
  const r = resultados[resultados.length - 1];
  console.log(`[${String(id).padStart(2, '0')}] ${r.estado.padEnd(18)} ${nombre}\n      ${r.evidencia}`);
}
const login = async (email, password) => st(await req('POST', B('auth/api/auth/login'), { body: { email, password } }), 200, `login ${email}`).token;
const dpi = n => String(TS + n).slice(-13).padStart(13, '7');
const familiar = n => ({ nombres: 'Familia', apellidos: `SQA ${n}`, dpi: dpi(500 + n), parentesco: 'hija', telefono: '55551234', email: `sqa.familiar${n}@example.com`, direccion: 'Mazatenango' });
const hoyGt = (menosDias = 0) => { const d = new Date(Date.now() - 6 * 3600e3 - menosDias * 864e5); return d.toISOString().slice(0, 10); };
const sql = q => execFileSync('docker', ['exec', 'asilo-sqlserver', 'sh', '-c',
  '/opt/mssql-tools18/bin/sqlcmd -b -I -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d AsiloCabezaAlgodon -h -1 -W -s "|" -Q "SET NOCOUNT ON; $0"', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

(async () => {
  const T = {};
  await caso(1, 'Login vÃ¡lido: 200 + JWT firmado', async () => {
    const r = st(await req('POST', B('auth/api/auth/login'), { body: { email: 'admin@asilo.gt', password: 'Admin12345' } }), 200, 'login');
    const [h, p] = r.token.split('.').slice(0, 2).map(x => JSON.parse(Buffer.from(x, 'base64url').toString()));
    exige(h.alg === 'HS256' && p.rol === 'admin' && p.exp > p.iat, 'JWT sin HS256/rol/exp');
    const malo = await req('POST', B('auth/api/auth/login'), { body: { email: 'admin@asilo.gt', password: 'otraCosa1' } });
    exige(malo.status === 401, `password incorrecta -> ${malo.status}`);
    T.admin = r.token;
    return `POST /api/auth/login -> 200, alg ${h.alg}, rol ${p.rol}, vence en ${(p.exp - p.iat) / 3600} h; password mala -> 401`;
  });
  for (const [k, e] of Object.entries({ mg: 'medico.general@asilo.gt', esp: 'especialista@asilo.gt', coord: 'coordinador@asilo.gt', enf: 'enfermeria@asilo.gt', far: 'farmacia@asilo.gt', lab: 'laboratorio@asilo.gt' }))
    T[k] = await login(e, 'Demo1234');
  const yo = async t => st(await req('GET', B('auth/api/auth/me'), { token: t }), 200, 'me');
  ctx.idEnf = (await yo(T.enf)).id ?? (await yo(T.enf)).sub; ctx.idEsp = (await yo(T.esp)).id ?? (await yo(T.esp)).sub;
  ctx.idMg = (await yo(T.mg)).id ?? (await yo(T.mg)).sub;

  await caso(2, 'RBAC: rol no autorizado en ruta administrativa -> 403', async () => {
    const pruebas = [
      ['laboratorio registra usuario', 'POST', 'auth/api/auth/register', T.lab, { nombre: 'x', email: 'x@x.gt', password: 'Abcdef12', rol: 'admin' }],
      ['enfermero consulta auditorÃ­a', 'GET', 'reportes/api/auditoria', T.enf],
      ['farmacia registra gasto', 'POST', 'financiero/api/financiero/gastos', T.far, { concepto: 'x', monto: 1, categoria: 'otros' }],
      ['especialista desactiva paciente', 'DELETE', 'pacientes/api/pacientes/1', T.esp, { motivoEgreso: 'xxxx' }],
      ['coordinador cambia precio', 'POST', 'laboratorio/api/laboratorio/precios', T.coord, { tipo: 'x', precioBase: 1 }],
      ['enfermero desactiva usuario', 'PATCH', 'auth/api/auth/usuarios/2/desactivar', T.enf],
    ];
    const out = [];
    for (const [n, m, u, t, b] of pruebas) { const r = await req(m, B(u), { token: t, body: b }); exige(r.status === 403, `${n} -> ${r.status}`); out.push(n); }
    return `${out.length} intentos -> 403: ${out.join('; ')}`;
  });

  await caso(3, 'Endpoint protegido sin token -> 401', async () => {
    const rutas = ['pacientes/api/pacientes', 'farmacia/api/farmacia/medicamentos', 'financiero/api/financiero/donaciones', 'laboratorio/api/laboratorio/precios', 'reportes/api/reportes/tipos', 'notificaciones/api/notificaciones', 'auth/api/auth/me'];
    for (const r of rutas) { const x = await req('GET', B(r)); exige(x.status === 401, `${r} sin token -> ${x.status}`); }
    const f = await req('GET', B('pacientes/api/pacientes'), { token: T.admin.slice(0, -3) + 'abc' });
    exige(f.status === 401, `firma alterada -> ${f.status}`);
    return `${rutas.length} rutas de los 7 servicios sin token -> 401; token con firma alterada -> 401 (que no toca la BD lo prueba rbac.test.js con repos simulados)`;
  });

  await caso(4, 'Mismo JWT aceptado por los 7 microservicios', async () => {
    const rutas = { auth: '/api/auth/me', farmacia: '/api/farmacia/medicamentos', pacientes: '/api/pacientes', laboratorio: '/api/laboratorio/precios', financiero: '/api/financiero/donaciones', reportes: '/api/reportes/tipos', notificaciones: '/api/notificaciones?limit=1' };
    for (const [s, r] of Object.entries(rutas)) {
      st(await req('GET', `http://localhost:${PUERTOS[s]}${r}`, { token: T.admin }), 200, `${s} directo`);
      st(await req('GET', B(s + r), { token: T.admin }), 200, `${s} por nginx`);
    }
    return 'el mismo token admin -> 200 en los 7 servicios, directo (3000-3006) y por nginx (/svc)';
  });

  await caso(5, 'Alta de interno con familiar principal y ficha 1:1', async () => {
    const base = { nombres: 'SQA', apellidos: `Caso Cinco ${TS}`, fechaNacimiento: '1944-03-02', genero: 'F', dpi: dpi(5) };
    const sin = await req('POST', B('pacientes/api/pacientes'), { token: T.enf, body: base });
    exige(sin.status === 400 && Array.isArray(sin.data.camposFaltantes), `sin familiar -> ${sin.status}`);
    const inc = await req('POST', B('pacientes/api/pacientes'), { token: T.enf, body: { ...base, familiar: { nombres: 'Solo nombre' } } });
    exige(inc.status === 400 && inc.data.camposFaltantes.length >= 5, `familiar incompleto -> ${inc.status}`);
    const p = st(await req('POST', B('pacientes/api/pacientes'), { token: T.enf, body: { ...base, familiar: familiar(5) } }), 201, 'alta');
    ctx.p = p;
    const filas = sql(`SELECT (SELECT COUNT(*) FROM familiares WHERE idPaciente=${p.id} AND principal=1), (SELECT COUNT(*) FROM fichas_medicas WHERE idPaciente=${p.id})`);
    exige(filas.replace(/\s/g, '') === '1|1', `familiares/fichas = ${filas}`);
    return `sin familiar -> 400 camposFaltantes [${sin.data.camposFaltantes.join(', ')}]; incompleto -> 400 (${inc.data.camposFaltantes.length} faltantes); completo -> 201 id ${p.id}; BD: 1 familiar principal y 1 ficha`;
  });

  await caso(6, 'Egreso: baja lÃ³gica, registro Ã­ntegro, sin DELETE fÃ­sico', async () => {
    const p = st(await req('POST', B('pacientes/api/pacientes'), { token: T.admin, body: { nombres: 'SQA', apellidos: `Egreso ${TS}`, fechaNacimiento: '1940-01-01', genero: 'M', dpi: dpi(6), familiar: familiar(6) } }), 201, 'alta');
    const s1 = await req('DELETE', B(`pacientes/api/pacientes/${p.id}`), { token: T.admin });
    exige(s1.status === 400, `sin motivo -> ${s1.status}`);
    const fut = await req('DELETE', B(`pacientes/api/pacientes/${p.id}`), { token: T.admin, body: { motivoEgreso: 'Traslado', fechaEgreso: '2099-01-01' } });
    exige(fut.status === 400, `fecha futura -> ${fut.status}`);
    st(await req('DELETE', B(`pacientes/api/pacientes/${p.id}`), { token: T.admin, body: { motivoEgreso: 'Traslado con su familia' } }), 200, 'egreso');
    const g = st(await req('GET', B(`pacientes/api/pacientes/${p.id}`), { token: T.admin }), 200, 'GET tras egreso');
    exige(g.activo === false && g.motivoEgreso && g.fechaEgreso, 'no quedÃ³ activo=false con motivo y fecha');
    const lista = st(await req('GET', B('pacientes/api/pacientes'), { token: T.admin }), 200, 'lista');
    exige(!lista.some(x => x.id === p.id), 'sigue en el listado de activos');
    const fila = sql(`SELECT COUNT(*) FROM pacientes WHERE id=${p.id}`);
    const sol = await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: p.id, especialidad: 'geriatria', motivo: 'x', idEnfermero: ctx.idEnf } });
    exige(sol.status === 409, `solicitud a egresado -> ${sol.status}`);
    ctx.pEgreso = p.id;
    return [ 'OK con diferencia', `sin motivo -> 400, fecha futura -> 400, con motivo -> 200; GET: activo=false, fechaEgreso ${String(g.fechaEgreso).slice(0, 10)}, motivo guardado; fuera del listado; fila en BD (${fila}); solicitud nueva -> 409. Diferencia de nombre: activo BIT en vez de estado='inactivo'` ];
  });

  await caso(7, 'Solicitud del MÃ©dico General con enfermero: pendiente_asignacion', async () => {
    const sinEnf = await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: ctx.p.id, especialidad: 'cardiologia', motivo: 'Dolor torÃ¡cico' } });
    exige(sinEnf.status === 400, `sin enfermero -> ${sinEnf.status}`);
    const noEnf = await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: ctx.p.id, especialidad: 'cardiologia', motivo: 'Dolor torÃ¡cico', idEnfermero: ctx.idEsp } });
    exige(noEnf.status === 400, `con un especialista como enfermero -> ${noEnf.status}`);
    const s = st(await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: ctx.p.id, especialidad: 'cardiologia', motivo: 'Dolor torÃ¡cico y disnea', idEnfermero: ctx.idEnf } }), 201, 'crear');
    exige(s.estado === 'pendiente_asignacion' && s.idEnfermero === ctx.idEnf, `estado ${s.estado}, enfermero ${s.idEnfermero}`);
    ctx.sol = s;
    return `sin enfermero -> 400; con usuario que no es enfermero -> 400; vÃ¡lida -> 201 id ${s.id}, estado pendiente_asignacion, idEnfermero ${s.idEnfermero}`;
  });

  await caso(8, 'Perfiles que no son mÃ©dico general no crean solicitudes', async () => {
    const out = [];
    for (const [n, t] of [['enfermero', T.enf], ['especialista', T.esp], ['coordinador', T.coord], ['farmacia', T.far], ['admin', T.admin]]) {
      const r = await req('POST', B('pacientes/api/solicitudes'), { token: t, body: { idPaciente: ctx.p.id, especialidad: 'neurologia', motivo: 'x', idEnfermero: ctx.idEnf } });
      exige(r.status === 403 && r.data.error, `${n} -> ${r.status}`);
      out.push(n);
    }
    return `${out.join(', ')} -> 403 con mensaje ("${(await req('POST', B('pacientes/api/solicitudes'), { token: T.enf, body: {} })).data.error}"); en la UI el formulario queda deshabilitado con aviso`;
  });

  await caso(9, 'RN-02: solicitud duplicada rechazada con la activa', async () => {
    const r = await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: ctx.p.id, especialidad: 'cardiologia', motivo: 'otra vez', idEnfermero: ctx.idEnf } });
    exige(r.status === 409 && r.data.solicitudActiva?.id === ctx.sol.id, `duplicada -> ${r.status} ${JSON.stringify(r.data)}`);
    const otra = st(await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: ctx.p.id, especialidad: 'neurologia', motivo: 'otra especialidad', idEnfermero: ctx.idEnf } }), 201, 'otra especialidad');
    ctx.solNeuro = otra;
    return `misma especialidad -> 409 solicitudActiva {id ${r.data.solicitudActiva.id}, ${r.data.solicitudActiva.estado}}: "${r.data.error}"; otra especialidad -> 201`;
  });

  await caso(10, 'NotificaciÃ³n por Brevo: log con estado e ID', async () => {
    await new Promise(r => setTimeout(r, 1500));
    const log = st(await req('GET', B('notificaciones/api/notificaciones?limit=50'), { token: T.admin }), 200, 'log');
    const n = log.find(x => x.destinatarioEmail === 'sqa.familiar5@example.com');
    exige(n && n.estado === 'enviada' && /^sim-/.test(n.idMensajeProveedor || ''), `notificaciÃ³n: ${JSON.stringify(n)}`);
    const salud = st(await req('GET', 'http://localhost:3006/health'), 200, 'health');
    return ['OK con diferencia', `notificaciÃ³n #${n.id} a ${n.destinatarioEmail}: estado ${n.estado}, idMensajeProveedor ${n.idMensajeProveedor}; servicio en modoSimulacion=${salud.modoSimulacion}. No se ejecutÃ³ Brevo real`];
  });

  await caso(12, 'Asignar cita: cita_asignada y aviso interno', async () => {
    const enf = await req('PATCH', B(`pacientes/api/solicitudes/${ctx.sol.id}/asignar-cita`), { token: T.enf, body: { fechaCita: '2026-12-01', horaCita: '10:00', idMedicoEspecialista: ctx.idEsp } });
    exige(enf.status === 403, `enfermero asigna -> ${enf.status}`);
    const s = st(await req('PATCH', B(`pacientes/api/solicitudes/${ctx.sol.id}/asignar-cita`), { token: T.coord, body: { fechaCita: '2026-12-01', horaCita: '10:00', idMedicoEspecialista: ctx.idEsp } }), 200, 'asignar');
    exige(s.estado === 'cita_asignada', `estado ${s.estado}`);
    const otraVez = await req('PATCH', B(`pacientes/api/solicitudes/${ctx.sol.id}/asignar-cita`), { token: T.coord, body: { fechaCita: '2026-12-01', horaCita: '10:00', idMedicoEspecialista: ctx.idEsp } });
    exige(otraVez.status === 409, `reasignar -> ${otraVez.status}`);
    const avMg = st(await req('GET', B('pacientes/api/avisos?noLeidos=true'), { token: T.mg }), 200, 'avisos mg');
    const avEnf = st(await req('GET', B('pacientes/api/avisos?noLeidos=true'), { token: T.enf }), 200, 'avisos enf');
    const a1 = avMg.find(a => a.idSolicitud === ctx.sol.id || String(a.mensaje || '').includes(String(ctx.sol.id)));
    const a2 = avEnf.find(a => a.idSolicitud === ctx.sol.id || String(a.mensaje || '').includes(String(ctx.sol.id)));
    exige(a1 && a2, `avisos mg=${!!a1} enf=${!!a2} ${JSON.stringify(avMg[0])}`);
    const ajeno = await req('PATCH', B(`pacientes/api/avisos/${a1.id}/leido`), { token: T.enf });
    exige(ajeno.status === 404, `marcar aviso ajeno -> ${ajeno.status}`);
    st(await req('PATCH', B(`pacientes/api/avisos/${a1.id}/leido`), { token: T.mg }), 200, 'leido');
    return `enfermero -> 403; coordinador -> 200 cita_asignada; reasignar -> 409; aviso #${a1.id} para el mÃ©dico general y #${a2.id} para el enfermero ("${a1.mensaje}"); aviso ajeno -> 404; marcar leÃ­do -> 200`;
  });

  await caso(13, 'Convertir a visita: en_atencion vinculada a la ficha', async () => {
    const mg = await req('POST', B(`pacientes/api/solicitudes/${ctx.sol.id}/convertir-a-visita`), { token: T.mg });
    exige(mg.status === 403, `mÃ©dico general convierte -> ${mg.status}`);
    const v = st(await req('POST', B(`pacientes/api/solicitudes/${ctx.sol.id}/convertir-a-visita`), { token: T.esp }), 201, 'convertir');
    const ficha = sql(`SELECT id FROM fichas_medicas WHERE idPaciente=${ctx.p.id}`);
    exige(String(v.idFichaMedica) === ficha && v.estado === 'en_atencion', `visita ${JSON.stringify(v)} ficha ${ficha}`);
    const s = st(await req('GET', B(`pacientes/api/solicitudes/${ctx.sol.id}`), { token: T.esp }), 200, 'sol');
    exige(s.estado === 'en_atencion', `solicitud ${s.estado}`);
    const dos = await req('POST', B(`pacientes/api/solicitudes/${ctx.sol.id}/convertir-a-visita`), { token: T.esp });
    exige(dos.status === 409, `segunda conversiÃ³n -> ${dos.status}`);
    ctx.v = v;
    return `mÃ©dico general -> 403; especialista -> 201 visita ${v.id} en_atencion con idFichaMedica ${v.idFichaMedica} = ficha del paciente; solicitud en_atencion; segunda conversiÃ³n -> 409`;
  });

  await caso(14, 'Cerrar visita sin campos: rechazo y estado incompleta', async () => {
    const r = await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/completar`), { token: T.esp });
    exige(r.status === 400 && r.data.camposFaltantes?.includes('diagnostico') && r.data.camposFaltantes?.includes('observaciones'), `-> ${r.status} ${JSON.stringify(r.data)}`);
    const v = st(await req('GET', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp }), 200, 'visita');
    exige(v.estado === 'incompleta', `estado ${v.estado}`);
    const solo = await req('PATCH', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp, body: { diagnostico: 'FibrilaciÃ³n auricular' } });
    st(solo, 200, 'guardar diagnÃ³stico');
    const r2 = await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/completar`), { token: T.esp });
    exige(r2.status === 400 && r2.data.camposFaltantes.join() === 'observaciones', `solo diagnÃ³stico -> ${JSON.stringify(r2.data)}`);
    return `sin nada -> 400 camposFaltantes [diagnostico, observaciones] y la visita queda incompleta (sigue editable); con solo diagnÃ³stico -> 400 [observaciones]; la UI resalta los campos (no automatizado aquÃ­)`;
  });

  await caso(15, 'Orden de laboratorio con costo con descuento registrado', async () => {
    const sinPrecio = await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/examenes`), { token: T.esp, body: { tipo: `Examen inexistente ${TS}` } });
    exige(sinPrecio.status === 409, `sin precio -> ${sinPrecio.status}`);
    const ex = st(await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/examenes`), { token: T.esp, body: { tipo: 'Electrocardiograma de 12 derivaciones' } }), 201, 'ordenar');
    exige(Number(ex.precioBase) === 200 && Number(ex.costo) === 160 && ex.estado === 'pendiente', `examen ${JSON.stringify(ex)}`);
    const ord = st(await req('GET', B('laboratorio/api/laboratorio/ordenes-pendientes'), { token: T.lab }), 200, 'Ã³rdenes');
    exige(ord.some(o => (o.id ?? o.idExamen) === ex.id), 'no aparece en Ã³rdenes pendientes');
    const costo = st(await req('GET', B(`laboratorio/api/laboratorio/examenes/${ex.id}/costo`), { token: T.lab }), 200, 'costo');
    exige(Number(costo.total) === 160 && costo.registradoAlOrdenar, `costo ${JSON.stringify(costo)}`);
    ctx.ex = ex;
    return `tipo sin precio -> 409; ECG ordenado -> 201 precioBase Q200, costo Q160 (20 % fundaciÃ³n) guardado al ordenar, estado pendiente; aparece en Ã³rdenes pendientes de laboratorio; costo registradoAlOrdenar=true`;
  });

  await caso(16, 'Resultado disponible y visible al especialista', async () => {
    const esp = await req('POST', B(`laboratorio/api/laboratorio/resultados/examen/${ctx.ex.id}`), { token: T.esp, body: { tipoResultado: 'texto', valorTexto: 'x' } });
    exige(esp.status === 403, `especialista registra resultado -> ${esp.status}`);
    const vac = await req('POST', B(`laboratorio/api/laboratorio/resultados/examen/${ctx.ex.id}`), { token: T.lab, body: { tipoResultado: 'numerico' } });
    exige(vac.status === 400, `numÃ©rico sin valor -> ${vac.status}`);
    st(await req('POST', B(`laboratorio/api/laboratorio/resultados/examen/${ctx.ex.id}`), { token: T.lab, body: { tipoResultado: 'texto', valorTexto: 'Ritmo sinusal, sin alteraciones agudas' } }), 201, 'registrar');
    const dup = await req('POST', B(`laboratorio/api/laboratorio/resultados/examen/${ctx.ex.id}`), { token: T.lab, body: { tipoResultado: 'texto', valorTexto: 'otro' } });
    exige(dup.status === 409, `segundo resultado -> ${dup.status}`);
    const v = st(await req('GET', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp }), 200, 'visita');
    const e = (v.examenes || []).find(x => x.id === ctx.ex.id);
    exige(e && e.estado === 'disponible', `examen en la visita: ${JSON.stringify(e)}`);
    const res = st(await req('GET', B(`laboratorio/api/laboratorio/resultados/examen/${ctx.ex.id}`), { token: T.esp }), 200, 'leer');
    return `especialista no registra (403); numÃ©rico sin valor -> 400; laboratorio registra -> 201; duplicado -> 409; la visita ya muestra el examen "disponible" y el especialista lee "${res.valorTexto}"`;
  });

  await caso(17, 'Despacho sin prescripciÃ³n: rechazo (RN-06)', async () => {
    const med = st(await req('POST', B('farmacia/api/farmacia/medicamentos'), { token: T.far, body: { nombre: `SQA Amiodarona ${TS}`, presentacion: 'tableta 200 mg', stock: 50, precioUnitario: 2.5 } }), 201, 'medicamento');
    ctx.med = med;
    const sinRx = await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.far, body: { idPaciente: ctx.p.id, cantidad: 1 } });
    exige(sinRx.status === 400, `sin prescripciÃ³n -> ${sinRx.status}`);
    const inexist = await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.far, body: { idPrescripcion: 999999, idPaciente: ctx.p.id, cantidad: 1 } });
    exige(inexist.status === 404, `prescripciÃ³n inexistente -> ${inexist.status}`);
    const rxLibre = st(await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/prescripciones`), { token: T.esp, body: { medicamento: 'Vitamina sin inventario', dosis: '1/24h', cantidadPrescrita: 3 } }), 201, 'rx sin inventario');
    const sinMed = await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.far, body: { idPrescripcion: rxLibre.id, idPaciente: ctx.p.id, cantidad: 1 } });
    exige([400, 409].includes(sinMed.status), `prescripciÃ³n sin medicamento de inventario -> ${sinMed.status}`);
    const esp = await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.esp, body: { idPrescripcion: rxLibre.id, cantidad: 1 } });
    exige(esp.status === 403, `especialista dispensa -> ${esp.status}`);
    return `sin prescripciÃ³n -> 400 ("${sinRx.data.error}"); inexistente -> 404; prescripciÃ³n sin medicamento de inventario -> ${sinMed.status}; especialista -> 403`;
  });

  await caso(18, 'Despacho parcial: prescripciÃ³n parcial y costo sumado a la visita', async () => {
    const rx = st(await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/prescripciones`), { token: T.esp, body: { medicamento: ctx.med.nombre, dosis: '1 tab/24h', indicaciones: 'con alimentos', idMedicamento: ctx.med.id, cantidadPrescrita: 10 } }), 201, 'rx');
    const d1 = st(await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.far, body: { idPrescripcion: rx.id, idPaciente: ctx.p.id, cantidad: 4 } }), 201, 'despacho 4');
    const pend = st(await req('GET', B(`farmacia/api/farmacia/prescripciones/pendientes/paciente/${ctx.p.id}`), { token: T.far }), 200, 'pendientes');
    const p = pend.find(x => x.id === rx.id);
    exige(p && p.estado === 'parcial' && p.cantidadRestante === 6, `prescripciÃ³n tras 4: ${JSON.stringify(p)}`);
    const exceso = await req('POST', B('farmacia/api/farmacia/dispensaciones'), { token: T.far, body: { idPrescripcion: rx.id, idPaciente: ctx.p.id, cantidad: 7 } });
    exige(exceso.status === 409, `exceso -> ${exceso.status}`);
    const stock = st(await req('GET', B(`farmacia/api/farmacia/medicamentos/${ctx.med.id}`), { token: T.far }), 200, 'med');
    exige(stock.stock === 46, `stock ${stock.stock} (esperaba 46)`);
    const v = st(await req('GET', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp }), 200, 'visita');
    exige(Math.abs(Number(v.costoFarmacia) - 8) < 0.001, `costoFarmacia ${v.costoFarmacia} (esperaba 4 x 2.50 x 0.8 = 8)`);
    ctx.rx = rx;
    return `10 prescritas, entrega 4 -> 201, estado parcial, faltan 6; pedir 7 -> 409 sin tocar stock (46); costoFarmacia de la visita Q${Number(v.costoFarmacia).toFixed(2)} = 4 Ã— Q2.50 Ã— 0.8; monto despacho Q${Number(d1.costoTotal ?? d1.monto ?? 0).toFixed(2)}`;
  });

  await caso(19, 'Cierre: completada y cargo atÃ³mico consulta+lab+farmacia', async () => {
    st(await req('PATCH', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp, body: { observaciones: 'Control en 30 dÃ­as; anticoagulaciÃ³n' } }), 200, 'observaciones');
    const c = st(await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/completar`), { token: T.esp }), 200, 'completar');
    const v = c.visita || c;
    exige(v.estado === 'completada', `estado ${v.estado}`);
    const dos = await req('POST', B(`pacientes/api/visitas/${ctx.v.id}/completar`), { token: T.esp });
    exige(dos.status === 409, `segundo cierre -> ${dos.status}`);
    const n = sql(`SELECT COUNT(*) FROM cargos_servicio WHERE idVisita=${ctx.v.id}`);
    exige(n === '1', `cargos de la visita: ${n}`);
    const cuenta = st(await req('GET', B(`financiero/api/financiero/estado-cuenta/${ctx.p.id}`), { token: T.admin }), 200, 'cuenta');
    const cargo = cuenta.cargos.find(x => x.idVisita === ctx.v.id);
    const rub = Object.fromEntries((cargo.detalles || []).map(d => [d.rubro, Number(d.monto)]));
    exige(rub.consulta === 120 && rub.laboratorio === 160 && rub.farmacia === 8 && Number(cargo.monto) === 288, `cargo ${JSON.stringify(cargo)}`);
    exige(cargo.idFamiliar, 'cargo sin familiar titular');
    const sol = st(await req('GET', B(`pacientes/api/solicitudes/${ctx.sol.id}`), { token: T.esp }), 200, 'sol');
    exige(sol.estado === 'completada', `solicitud ${sol.estado}`);
    const edit = await req('PATCH', B(`pacientes/api/visitas/${ctx.v.id}`), { token: T.esp, body: { diagnostico: 'cambio' } });
    exige(edit.status === 409, `editar cerrada -> ${edit.status}`);
    ctx.cargo = cargo;
    return `cierre -> 200 completada y solicitud completada; un solo cargo #${cargo.id} Q${cargo.monto} al familiar #${cargo.idFamiliar}: consulta Q120 (150 âˆ’ 20 %), laboratorio Q160, farmacia Q8; segundo cierre -> 409; editar cerrada -> 409`;
  });

  await caso(20, 'Saldos no negativos y familiar completo', async () => {
    const mayor = await req('POST', B(`financiero/api/financiero/cargos/${ctx.cargo.id}/abonos`), { token: T.admin, body: { monto: 288.01 } });
    exige(mayor.status === 409, `abono mayor -> ${mayor.status}`);
    for (const m of [0, -5, 'abc']) { const r = await req('POST', B(`financiero/api/financiero/cargos/${ctx.cargo.id}/abonos`), { token: T.admin, body: { monto: m } }); exige(r.status === 400, `abono ${m} -> ${r.status}`); }
    const a = st(await req('POST', B(`financiero/api/financiero/cargos/${ctx.cargo.id}/abonos`), { token: T.admin, body: { monto: 100 } }), 201, 'abono 100');
    const cuenta = st(await req('GET', B(`financiero/api/financiero/estado-cuenta/${ctx.p.id}`), { token: T.admin }), 200, 'cuenta');
    const c = cuenta.cargos.find(x => x.id === ctx.cargo.id);
    exige(Number(c.saldo) === 188 && c.estado === 'parcial', `saldo ${c.saldo} ${c.estado}`);
    let directo = '';
    try { sql(`UPDATE cargos_servicio SET montoPagado = monto + 1 WHERE id=${ctx.cargo.id}`); directo = 'UPDATE aceptado (!)'; } catch (e) { directo = /CK_cargos_saldo_no_negativo/.test(`${e.stdout}${e.stderr}${e.message}`) ? 'CHECK CK_cargos_saldo_no_negativo lo rechaza' : `error: ${e.message.slice(0, 80)}`; }
    exige(/CHECK/.test(directo) && sql(`SELECT montoPagado FROM cargos_servicio WHERE id=${ctx.cargo.id}`) === '100.00', `saldo negativo directo en BD: ${directo}`);
    // Paciente "antiguo" sin familiar (insertado directo: la API ya no lo permite)
    const idL = sql(`INSERT INTO pacientes (nombres, apellidos, fechaNacimiento, genero, dpi, fechaIngreso, activo) OUTPUT INSERTED.id VALUES ('SQA', 'Sin familiar ${TS}', '1939-01-01', 'F', '${dpi(20)}', SYSUTCDATETIME(), 1)`).split('\n')[0].trim();
    const cg = await req('POST', B('financiero/api/financiero/cargos'), { token: T.admin, body: { idPaciente: Number(idL), concepto: 'x', monto: 10 } });
    const cu = await req('POST', B('financiero/api/financiero/cuotas'), { token: T.admin, body: { idPaciente: Number(idL), mes: 1, anio: 2026, monto: 10 } });
    exige(cg.status === 409 && cu.status === 409, `sin familiar: cargo ${cg.status}, cuota ${cu.status}`);
    return `abono mayor al saldo -> 409; abono 0/negativo/texto -> 400; abono Q100 -> saldo Q188 parcial; poner el saldo negativo directo en la BD -> ${directo}; cargo y cuota a paciente sin familiar -> 409 ("${cg.data.error}")`;
  });

  await caso(21, 'Alertas de cuotas y saldos vencidos (naranja / roja)', async () => {
    const mk = async (n, dias) => {
      const p = st(await req('POST', B('pacientes/api/pacientes'), { token: T.admin, body: { nombres: 'SQA', apellidos: `Mora ${n} ${TS}`, fechaNacimiento: '1941-01-01', genero: 'F', dpi: dpi(30 + n), familiar: familiar(30 + n) } }), 201, 'alta');
      st(await req('POST', B('financiero/api/financiero/cuotas'), { token: T.admin, body: { idPaciente: p.id, mes: 1, anio: 2025, monto: 200, fechaVencimiento: hoyGt(dias) } }), 201, `cuota ${dias}d`);
      return p;
    };
    const pN = await mk(1, 5), pR = await mk(2, 40);
    const coord = await req('POST', B('financiero/api/financiero/cuotas'), { token: T.coord, body: { idPaciente: pN.id, mes: 2, anio: 2025, monto: 1 } });
    exige(coord.status === 403, `coordinador emite -> ${coord.status}`);
    const enf = await req('GET', B('financiero/api/financiero/alertas'), { token: T.enf });
    exige(enf.status === 403, `enfermero ve alertas -> ${enf.status}`);
    const panel = st(await req('GET', B('financiero/api/financiero/alertas'), { token: T.coord }), 200, 'alertas');
    const aN = panel.find(a => a.idPaciente === pN.id), aR = panel.find(a => a.idPaciente === pR.id);
    exige(aN?.alerta.nivel === 'naranja' && aR?.alerta.nivel === 'roja', `niveles: ${aN?.alerta.nivel} / ${aR?.alerta.nivel}`);
    const iR = panel.findIndex(a => a.alerta.nivel !== 'roja');
    exige(iR === -1 || panel.slice(iR).every(a => a.alerta.nivel !== 'roja'), 'las rojas no van primero');
    st(await req('POST', B('financiero/api/financiero/pagos-cuota'), { token: T.admin, body: { idPaciente: pN.id, mes: 1, anio: 2025 } }), 201, 'pagar');
    const panel2 = st(await req('GET', B('financiero/api/financiero/alertas'), { token: T.admin }), 200, 'alertas 2');
    exige(!panel2.some(a => a.idPaciente === pN.id), 'la pagada sigue con alerta');
    return `cuota vencida hace 5 dÃ­as -> naranja ("${aN.alerta.motivos[0]}"); hace 40 -> roja ("${aR.alerta.motivos[0]}"); rojas primero; coordinador ve el panel, enfermero -> 403, coordinador no emite -> 403; al pagarla sale del panel`;
  });

  await caso(22, 'ExportaciÃ³n PDF y Excel con diseÃ±o y fÃ³rmulas', async () => {
    const tipos = st(await req('GET', B('reportes/api/reportes/tipos'), { token: T.admin }), 200, 'tipos');
    const lista = (tipos.tipos || tipos).map(t => t.id || t.tipo || t);
    const desde = hoyGt(30), hasta = hoyGt(0);
    for (const t of lista) {
      const pdf = await req('GET', B(`reportes/api/reportes/${t}?desde=${desde}&hasta=${hasta}&formato=pdf`), { token: T.admin, raw: true });
      exige(pdf.status === 200 && pdf.buf.slice(0, 4).toString() === '%PDF', `${t} pdf -> ${pdf.status}`);
      const xl = await req('GET', B(`reportes/api/reportes/${t}?desde=${desde}&hasta=${hasta}&formato=excel`), { token: T.admin, raw: true });
      exige(xl.status === 200 && xl.buf.slice(0, 2).toString() === 'PK', `${t} excel -> ${xl.status}`);
    }
    const xl = await req('GET', B(`reportes/api/reportes/costos-por-paciente?desde=${desde}&hasta=${hasta}&formato=excel`), { token: T.admin, raw: true });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xl.buf); const ws = wb.worksheets[0];
    let formTotal = null, formFila = null, banda = String(ws.getCell('A1').value);
    ws.eachRow(r => r.eachCell(c => { const f = c.formula || c.value?.formula; if (f && /^SUM/.test(f)) formTotal = f; else if (f && /\+/.test(f)) formFila = f; }));
    exige(formTotal && formFila && /CABEZA DE ALGOD/i.test(banda), `fÃ³rmulas ${formTotal} / ${formFila}, banda ${banda}`);
    const json = st(await req('GET', B(`reportes/api/reportes/costos-por-paciente?desde=${desde}&hasta=${hasta}`), { token: T.admin }), 200, 'json');
    const fila = json.filas.find(f => f.idPaciente === ctx.p.id);
    exige(fila && Number(fila.totalGeneral) === 288 && Number(fila.farmacia) === 8, `fila del paciente ${JSON.stringify(fila)}`);
    return `${lista.length} reportes -> PDF (%PDF) y Excel (xlsx) 200; costos por paciente: total con ${formTotal}, fila con ${formFila}, banda "${banda.slice(0, 40)}"; el paciente del flujo suma Q288 (farmacia Q8, sin doble conteo)`;
  });

  await caso(23, 'SQL injection: entrada tratada como texto literal', async () => {
    const l = await req('POST', B('auth/api/auth/login'), { body: { email: "admin@asilo.gt' OR '1'='1' --", password: "' OR 1=1 --" } });
    exige([400, 401].includes(l.status), `login inyectado -> ${l.status}`);
    const nombre = "Robert'); DROP TABLE pacientes;--";
    const p = st(await req('POST', B('pacientes/api/pacientes'), { token: T.admin, body: { nombres: nombre, apellidos: `O'Brien ${TS}`, fechaNacimiento: '1942-02-02', genero: 'M', dpi: dpi(23), familiar: familiar(23) } }), 201, 'alta con SQL');
    const g = st(await req('GET', B(`pacientes/api/pacientes/${p.id}`), { token: T.admin }), 200, 'leer');
    exige(g.nombres === nombre, 'no se guardÃ³ literal');
    const id = await req('GET', B('pacientes/api/pacientes/1%20OR%201=1'), { token: T.admin });
    exige([400, 404].includes(id.status), `id inyectado -> ${id.status}`);
    const rep = await req('GET', B("reportes/api/reportes/costos-por-paciente?idPaciente=1%20OR%201=1"), { token: T.admin });
    const rep2 = await req('GET', B("reportes/api/reportes/entradas?desde=2026-01-01'--"), { token: T.admin });
    exige(rep.status === 400 && rep2.status === 400, `reportes -> ${rep.status}/${rep2.status}`);
    const dpiR = await req('GET', B(`laboratorio/api/laboratorio/pacientes/dpi/${encodeURIComponent("1' OR '1'='1")}`), { token: T.lab });
    exige([400, 404].includes(dpiR.status), `dpi inyectado -> ${dpiR.status}`);
    const sigue = sql('SELECT COUNT(*) FROM pacientes');
    return `login con ' OR 1=1 -> ${l.status}; paciente "${nombre}" guardado y leÃ­do literal; id "1 OR 1=1" -> ${id.status}; filtros de reportes -> 400; DPI inyectado -> ${dpiR.status}; la tabla pacientes sigue (${sigue} filas)`;
  });

  await caso(24, 'AuditorÃ­a: usuario, IP, mÃ³dulo, datos anteriores/nuevos', async () => {
    const enf = await req('GET', B('reportes/api/auditoria'), { token: T.enf });
    exige(enf.status === 403, `enfermero -> ${enf.status}`);
    const a = st(await req('GET', B(`reportes/api/auditoria?entidad=paciente&idEntidad=${ctx.pEgreso}`), { token: T.admin }), 200, 'auditorÃ­a');
    const des = a.find(r => r.accion === 'desactivar');
    exige(des && des.usuario === 'admin@asilo.gt' && des.ip && des.modulo && des.datosAnteriores?.activo === true && des.datosNuevos?.activo === false, `registro ${JSON.stringify(des)}`);
    const todo = JSON.stringify(st(await req('GET', B('reportes/api/auditoria?limite=500'), { token: T.admin }), 200, 'todo'));
    exige(!/passwordHash|\$2[aby]\$/.test(todo), 'la auditorÃ­a contiene hashes de contraseÃ±a');
    return ['OK con diferencia', `egreso del paciente ${ctx.pEgreso}: usuario ${des.usuario}, IP ${des.ip}, mÃ³dulo ${des.modulo}, antes activo=true â†’ despuÃ©s activo=false, motivo "${des.datosNuevos.motivoEgreso}"; sin contraseÃ±as en la bitÃ¡cora; enfermero -> 403. En Docker Desktop la IP es la del gateway; la IP real del navegador solo se ve en el Debian (no verificado)`];
  });

  // caso 11 y 25 se corren aparte (override de Brevo y carga con 50 usuarios)
  require('fs').writeFileSync(path.join(REPO, 'docs', 'verificacion-plan-sqa.json'), JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter(r => r.estado === 'FALLA').length;
  console.log(`\n${resultados.length} casos verificados, ${fallas} con FALLA (el 11 y el 25: npm run test:caso11 y npm run test:carga)`);
  process.exitCode = fallas ? 1 : 0;
})();
