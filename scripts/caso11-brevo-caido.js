// Caso 11 con Brevo inalcanzable: la solicitud se crea igual y la notificacion
// pasa a fallida y luego a fallida_definitiva por el job de reintentos.
// No llama a Brevo real: el override apunta a 127.0.0.1:9. Solo local.
//
//   docker compose -f docker-compose.yml -f scripts/override-brevo-caido.yml up -d --no-deps notificaciones-service
//   npm run test:caso11
//   docker compose up -d --no-deps notificaciones-service     # restaura MODO_SIMULACION

const B = s => `http://localhost:8090/svc/${s}`;
const TS = Date.now();
async function req(m, u, { body, token } = {}) {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch {} return { status: r.status, data: d };
}
const login = async (e, p) => (await req('POST', B('auth/api/auth/login'), { body: { email: e, password: p } })).data.token;
(async () => {
  const salud = (await req('GET', 'http://localhost:3006/health')).data;
  console.log('health:', JSON.stringify(salud));
  const adm = await login('admin@asilo.gt', 'Admin12345'), mg = await login('medico.general@asilo.gt', 'Demo1234'), enf = await login('enfermeria@asilo.gt', 'Demo1234');
  const idEnf = (await req('GET', B('auth/api/auth/me'), { token: enf })).data.id;
  const correo = `sqa.caso11.${TS}@example.com`;
  const p = (await req('POST', B('pacientes/api/pacientes'), { token: adm, body: { nombres: 'SQA', apellidos: `Caso Once ${TS}`, fechaNacimiento: '1943-04-04', genero: 'M', dpi: String(TS).slice(-13).padStart(13, '8'), familiar: { nombres: 'Fam', apellidos: 'Once', dpi: String(TS + 9).slice(-13).padStart(13, '9'), parentesco: 'hijo', telefono: '55550011', email: correo, direccion: 'Mazatenango' } } })).data;
  const t0 = Date.now();
  const s = await req('POST', B('pacientes/api/solicitudes'), { token: mg, body: { idPaciente: p.id, especialidad: 'geriatria', motivo: 'Caso 11: Brevo caído', idEnfermero: idEnf } });
  const ms = Date.now() - t0;
  const g = await req('GET', B(`pacientes/api/solicitudes/${s.data.id}`), { token: mg });
  console.log(`solicitud -> ${s.status} en ${ms} ms; GET -> ${g.status} estado ${g.data.estado}`);
  const visto = [];
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const log = (await req('GET', B('notificaciones/api/notificaciones?limit=50'), { token: adm })).data;
    const n = log.find(x => x.destinatarioEmail === correo);
    if (n) { const k = `${n.estado}/intentos=${n.intentos}`; if (visto[visto.length - 1] !== k) { visto.push(k); console.log(`  t+${(i + 1) * 2}s notificación #${n.id}: ${k}; error "${n.mensajeError}"`); } if (n.estado === 'fallida_definitiva') break; }
  }
  console.log('secuencia:', visto.join(' -> '));
})();
