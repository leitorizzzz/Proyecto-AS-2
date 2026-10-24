#!/usr/bin/env node
/**
 * Prueba de carga (caso 25 del plan del SQA): N usuarios concurrentes que
 * inician sesion, listan pacientes y crean solicitudes. Reporta p50, p95 y
 * maximo por operacion; pasa si ninguna peticion supera 3 s.
 *
 * Solo toca registros propios: crea sus pacientes ("Carga <corrida>") y al
 * final cancela sus solicitudes y desactiva sus pacientes.
 *
 * Uso:
 *   npm run test:carga                      (30 usuarios, 3 vueltas)
 *   USUARIOS=50 VUELTAS=5 npm run test:carga
 *   BASE_HOST=100.96.172.77 npm run test:carga
 */
const BASE_HOST = process.env.BASE_HOST || 'localhost';
const USUARIOS = Math.min(Math.max(Number(process.env.USUARIOS || 30), 1), 200);
const VUELTAS = Math.max(Number(process.env.VUELTAS || 3), 1);
const LIMITE_MS = Number(process.env.LIMITE_MS || 3000);
const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@asilo.gt',
  password: process.env.ADMIN_PASSWORD || 'Admin12345'
};
const API = {
  auth: `http://${BASE_HOST}:3000`,
  pacientes: `http://${BASE_HOST}:3002`
};
const MG = { nombre: 'E2E Medico General', email: 'e2e.medicogeneral@asilo.gt', password: 'E2eDemo1234', rol: 'medico_general' };
const ENF = { nombre: 'E2E Enfermero', email: 'e2e.enfermero@asilo.gt', password: 'E2eDemo1234', rol: 'enfermero' };

async function req(method, url, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = performance.now();
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const ms = performance.now() - t0;
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, data, ms };
}

async function login(u) {
  const r = await req('POST', `${API.auth}/api/auth/login`, { body: { email: u.email, password: u.password } });
  if (r.status !== 200) throw new Error(`login ${u.email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function asegurarUsuario(adminToken, u) {
  const r = await req('POST', `${API.auth}/api/auth/register`, { body: u, token: adminToken });
  // 201 = creado; 400 'ya existe' = ya estaba (mismo criterio que e2e-smoke).
  if (r.status === 201 || (r.status === 400 && /ya existe/i.test(String(r.data?.error)))) return;
  throw new Error(`registro ${u.email}: ${r.status} ${JSON.stringify(r.data)}`);
}

function percentil(valores, p) {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
}

(async function main() {
  const corrida = Date.now();
  console.log(`\nCarga: ${USUARIOS} usuarios concurrentes x ${VUELTAS} vueltas contra ${BASE_HOST} (limite ${LIMITE_MS} ms)\n`);

  // Preparacion (fuera de la medicion): usuarios y un paciente propio por
  // usuario virtual, para que RN-02 no choque entre ellos.
  const adminToken = await login(ADMIN);
  await asegurarUsuario(adminToken, MG);
  await asegurarUsuario(adminToken, ENF);
  const enfToken = await login(ENF);
  const idEnfermero = (await req('GET', `${API.auth}/api/auth/me`, { token: enfToken })).data.id;
  const pacientes = [];
  for (let i = 0; i < USUARIOS; i++) {
    const dpi = String(corrida * 100 + i).slice(-13).padStart(13, '0');
    const r = await req('POST', `${API.pacientes}/api/pacientes`, {
      token: adminToken,
      body: {
        nombres: 'Carga', apellidos: `${corrida} #${i}`, fechaNacimiento: '1950-01-01', genero: 'F', dpi,
        familiar: { nombres: 'Familiar', apellidos: 'Carga', dpi: String(corrida * 100 + 50 + i).slice(-13).padStart(13, '0'),
                    parentesco: 'hijo(a)', telefono: '55550000', email: 'carga@example.com', direccion: 'Mazatenango (carga)' }
      }
    });
    if (r.status !== 201) throw new Error(`paciente de carga: ${r.status} ${JSON.stringify(r.data)}`);
    pacientes.push(r.data.id);
  }

  const tiempos = { login: [], listarPacientes: [], crearSolicitud: [], listarSolicitudes: [] };
  const errores = [];
  const solicitudes = [];

  async function usuarioVirtual(u) {
    for (let v = 0; v < VUELTAS; v++) {
      const l = await req('POST', `${API.auth}/api/auth/login`, { body: { email: MG.email, password: MG.password } });
      tiempos.login.push(l.ms);
      if (l.status !== 200) { errores.push(`login ${l.status}`); continue; }
      const token = l.data.token;

      const p = await req('GET', `${API.pacientes}/api/pacientes`, { token });
      tiempos.listarPacientes.push(p.ms);
      if (p.status !== 200) errores.push(`listar pacientes ${p.status}`);

      const s = await req('POST', `${API.pacientes}/api/solicitudes`, {
        token, body: { idPaciente: pacientes[u], especialidad: `carga-${corrida}-${v}`, motivo: 'prueba de carga', idEnfermero }
      });
      tiempos.crearSolicitud.push(s.ms);
      if (s.status === 201) solicitudes.push(s.data.id);
      else errores.push(`crear solicitud ${s.status} ${JSON.stringify(s.data)}`);

      const ls = await req('GET', `${API.pacientes}/api/solicitudes`, { token });
      tiempos.listarSolicitudes.push(ls.ms);
      if (ls.status !== 200) errores.push(`listar solicitudes ${ls.status}`);
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: USUARIOS }, (_, u) => usuarioVirtual(u)));
  const totalSeg = (performance.now() - t0) / 1000;

  const todos = Object.values(tiempos).flat();
  const fila = (nombre, v) => console.log(
    `${nombre.padEnd(20)} n=${String(v.length).padStart(4)}  p50=${percentil(v, 50).toFixed(0).padStart(5)} ms` +
    `  p95=${percentil(v, 95).toFixed(0).padStart(5)} ms  max=${Math.max(...v).toFixed(0).padStart(5)} ms`);
  for (const [k, v] of Object.entries(tiempos)) fila(k, v);
  fila('TODAS', todos);
  console.log(`\n${todos.length} peticiones en ${totalSeg.toFixed(1)} s (${(todos.length / totalSeg).toFixed(1)} req/s), ${errores.length} errores`);
  if (errores.length) console.log('Errores:', [...new Set(errores)].slice(0, 5).join(' | '));

  // Limpieza: solo lo creado por esta corrida.
  const mgToken = await login(MG);
  for (const id of solicitudes) await req('PATCH', `${API.pacientes}/api/solicitudes/${id}/cancelar`, { token: mgToken });
  for (const id of pacientes) {
    await req('DELETE', `${API.pacientes}/api/pacientes/${id}`, { token: adminToken, body: { motivoEgreso: 'Fin de la prueba de carga' } });
  }
  console.log(`Limpieza: ${solicitudes.length} solicitudes canceladas y ${pacientes.length} pacientes de carga desactivados.`);

  const maximo = Math.max(...todos);
  const okCarga = errores.length === 0 && maximo < LIMITE_MS;
  console.log(okCarga
    ? `\nCarga OK — ninguna peticion supero ${LIMITE_MS} ms (max ${maximo.toFixed(0)} ms, p95 ${percentil(todos, 95).toFixed(0)} ms).`
    : `\nCarga FALLA — max ${maximo.toFixed(0)} ms, p95 ${percentil(todos, 95).toFixed(0)} ms, ${errores.length} errores.`);
  process.exitCode = okCarga ? 0 : 1;
})().catch(e => { console.error('Carga abortada:', e.message); process.exitCode = 1; });
