/* ============================================================
 * Sistema Asilo Cabeza de Algodon — frontend
 * HTML + CSS + JS plano. Sin framework, sin build.
 *
 * Convenciones internas:
 *   - Todos los request pasan por api(...) que agrega el JWT.
 *   - Cada tab tiene una funcion cargar<Tab>() que puebla su vista.
 *   - Al fallar una llamada, ok/error muestra el mensaje en el
 *     nodo <div> destinado a mensajes de esa seccion.
 * ============================================================ */

/* ---------- Configuracion de endpoints ----------
   Los microservicios estan en el mismo host que sirve este HTML.
   Cuando el frontend corre en 8090 dentro de docker-compose y el
   navegador ve localhost:8090, cada servicio se alcanza en su
   puerto publicado. En prod (Debian) el HOST es el mismo. */
const HOST = window.location.hostname || 'localhost';
const API = {
  auth:            `http://${HOST}:3000`,
  farmacia:        `http://${HOST}:3001`,
  pacientes:       `http://${HOST}:3002`,
  laboratorio:     `http://${HOST}:3003`,
  financiero:      `http://${HOST}:3004`,
  reportes:        `http://${HOST}:3005`,
  notificaciones:  `http://${HOST}:3006`
};

/* ---------- Estado global (minimo) ---------- */
const state = {
  token: null,
  usuario: null,
  pacienteSeleccionadoFarmacia: null,
  visitaSeleccionada: null
};

/* ============================================================
 *   HELPERS
 * ============================================================ */

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }

function ok(el, texto) { el.className = 'msg ok'; el.textContent = texto; }
function error(el, texto) { el.className = 'msg error'; el.textContent = texto; }
function warn(el, texto) { el.className = 'msg warn'; el.textContent = texto; }
function limpiar(el) { el.className = ''; el.textContent = ''; }

function money(n) {
  if (n == null || isNaN(Number(n))) return '';
  return 'Q ' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fechaCorta(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('es-GT', { year:'numeric', month:'short', day:'numeric' });
}
function fechaHora(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString('es-GT', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function chip(estado) {
  const clase = String(estado || '').replace(/\s+/g, '_');
  return `<span class="chip ${clase}">${estado || '—'}</span>`;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function decodificarJWT(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
  } catch { return null; }
}

async function api(base, path, opts = {}) {
  const url = base + path;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const init = { method: opts.method || 'GET', headers };
  if (opts.body != null) init.body = JSON.stringify(opts.body);

  const resp = await fetch(url, init);
  const contentType = resp.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) body = await resp.json().catch(() => null);
  else body = await resp.text().catch(() => null);

  if (!resp.ok) {
    const msg = (body && body.error) || (typeof body === 'string' ? body : `HTTP ${resp.status}`);
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return body;
}

function puede(...rolesPermitidos) {
  if (!state.usuario) return false;
  return rolesPermitidos.includes(state.usuario.rol);
}

/* ============================================================
 *   AUTENTICACION Y ARRANQUE
 * ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Rehidratacion de sesion
  const saved = localStorage.getItem('asilo.token');
  if (saved) {
    state.token = saved;
    state.usuario = decodificarJWT(saved);
    if (state.usuario && state.usuario.exp * 1000 > Date.now()) {
      abrirApp();
    } else {
      localStorage.removeItem('asilo.token');
      state.token = null; state.usuario = null;
    }
  }

  $('#formLogin').addEventListener('submit', onLogin);
  $('#btnSalir').addEventListener('click', onLogout);
  $$('.tab').forEach(b => b.addEventListener('click', () => cambiarTab(b.dataset.tab)));

  // Formularios que existen desde el inicio
  $('#formPaciente').addEventListener('submit', onCrearPaciente);
  $('#formSolicitud').addEventListener('submit', onCrearSolicitud);
  $('#formDispensar').addEventListener('submit', onDispensar);
  $('#formResultado').addEventListener('submit', onRegistrarResultado);
  $('#formCargo').addEventListener('submit', onRegistrarCargo);
  $('#formCuota').addEventListener('submit', onRegistrarCuota);
  $('#formDonante').addEventListener('submit', onRegistrarDonante);
  $('#formDonacion').addEventListener('submit', onRegistrarDonacion);

  $('#dPaciente').addEventListener('change', async () => {
    await cargarPrescripcionesPendientes();
    await cargarHistorialFarmacia();
  });
  $('#rxIdMedicamento').addEventListener('change', () => {
    const sel = $('#rxIdMedicamento');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      // Pre-rellenar el texto con el nombre del medicamento elegido
      const label = opt.textContent.split(' — ')[0];
      $('#rxMedicamento').value = label;
    }
  });
  $('#fPaciente').addEventListener('change', cargarEstadoCuenta);
  $('#selectorVisita').addEventListener('change', cargarDetalleVisita);
  $('#btnGuardarClinico').addEventListener('click', onGuardarClinico);
  $('#btnCompletarVisita').addEventListener('click', onCompletarVisita);
  $('#btnAgregarExamen').addEventListener('click', onAgregarExamen);
  $('#btnAgregarPrescripcion').addEventListener('click', onAgregarPrescripcion);
  $('#btnRepVer').addEventListener('click', () => generarReporte('json'));
  $('#btnRepPdf').addEventListener('click', () => generarReporte('pdf'));
  $('#btnRepExcel').addEventListener('click', () => generarReporte('excel'));

  // Rango de fechas por defecto: ultimo trimestre
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
  $('#repDesde').value = inicio.toISOString().slice(0, 10);
  $('#repHasta').value = hoy.toISOString().slice(0, 10);
});

async function onLogin(e) {
  e.preventDefault();
  const msg = $('#msgLogin'); limpiar(msg);
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const btn = $('#btnLogin'); btn.disabled = true;
  try {
    const resp = await api(API.auth, '/api/auth/login', {
      method: 'POST', body: { email, password }
    });
    state.token = resp.token;
    state.usuario = decodificarJWT(resp.token);
    localStorage.setItem('asilo.token', resp.token);
    abrirApp();
  } catch (err) {
    error(msg, err.message || 'No se pudo iniciar sesión');
  } finally {
    btn.disabled = false;
  }
}

function onLogout() {
  localStorage.removeItem('asilo.token');
  state.token = null; state.usuario = null;
  $('#vistaApp').classList.add('hidden');
  $('#vistaLogin').classList.remove('hidden');
}

function abrirApp() {
  $('#vistaLogin').classList.add('hidden');
  $('#vistaApp').classList.remove('hidden');
  const nombre = state.usuario?.email?.split('@')[0] || 'personal';
  $('#usuarioNombre').textContent = state.usuario?.email || '—';
  $('#usuarioRol').textContent = state.usuario?.rol || '—';
  $('#saludoNombre').textContent = nombre.replace(/[._-]+/g, ' ');
  cambiarTab('dashboard');
}

/* ============================================================
 *   TABS
 * ============================================================ */

const CARGADORES = {
  dashboard:    cargarDashboard,
  pacientes:    cargarPacientes,
  solicitudes:  cargarSolicitudes,
  visitas:      cargarVisitasTab,
  farmacia:     cargarFarmacia,
  laboratorio:  cargarLaboratorio,
  financiero:   cargarFinancieroTab,
  reportes:     () => {}    // el usuario dispara la generacion
};

function cambiarTab(tab) {
  $$('.tab').forEach(b => b.classList.toggle('activo', b.dataset.tab === tab));
  $$('main.stage > section').forEach(s => s.classList.add('hidden'));
  const seccion = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (seccion) seccion.classList.remove('hidden');
  (CARGADORES[tab] || (() => {}))();
}

/* ============================================================
 *   DASHBOARD
 * ============================================================ */

async function cargarDashboard() {
  // Estados iniciales de carga
  $('#kpiPacientes').textContent = '···';
  $('#kpiSolicitudesActivas').textContent = '···';
  $('#kpiVisitasActivas').textContent = '···';
  $('#kpiAlertasSaldo').textContent = '···';
  $('#tbodyDashSolic').innerHTML = `<tr><td colspan="4"><span class="cargando">Cargando…</span></td></tr>`;

  try {
    const [pacientes, solicitudes] = await Promise.all([
      api(API.pacientes, '/api/pacientes'),
      api(API.pacientes, '/api/solicitudes')
    ]);
    $('#kpiPacientes').textContent = pacientes.length;

    const activas = solicitudes.filter(s =>
      ['pendiente_asignacion','cita_asignada','en_atencion'].includes(s.estado));
    $('#kpiSolicitudesActivas').textContent = activas.length;

    const enAtencion = solicitudes.filter(s => s.estado === 'en_atencion');
    $('#kpiVisitasActivas').textContent = enAtencion.length;

    const mapa = Object.fromEntries(pacientes.map(p => [p.id, `${p.nombres} ${p.apellidos}`]));
    $('#contadorDashSolic').textContent = `${solicitudes.length} en el sistema`;
    const rows = solicitudes.slice(0, 8).map(s => `
      <tr>
        <td>${esc(mapa[s.idPaciente] || `Paciente #${s.idPaciente}`)}</td>
        <td>${esc(s.especialidad)}</td>
        <td>${chip(s.estado)}</td>
        <td class="tiny">${fechaHora(s.fechaCreacion)}</td>
      </tr>`).join('');
    $('#tbodyDashSolic').innerHTML = rows ||
      `<tr><td colspan="4" class="tiny">Sin solicitudes todavía — aparecerán aquí cuando el médico general registre una.</td></tr>`;

    // KPI alertas de saldo: consulta financiero para los primeros 10
    // pacientes (compromiso simple entre latencia y cobertura).
    cargarKpiAlertasSaldo(pacientes.slice(0, 20));
  } catch (err) {
    $('#kpiPacientes').textContent = '—';
    $('#kpiSolicitudesActivas').textContent = '—';
    $('#kpiVisitasActivas').textContent = '—';
    $('#kpiAlertasSaldo').textContent = '—';
    $('#tbodyDashSolic').innerHTML =
      `<tr><td colspan="4"><div class="msg error">No se pudo cargar el panel: ${esc(err.message)}</div></td></tr>`;
  }
}

async function cargarKpiAlertasSaldo(pacientes) {
  if (!pacientes.length) {
    $('#kpiAlertasSaldo').textContent = '0';
    return;
  }
  try {
    const resultados = await Promise.all(pacientes.map(p =>
      api(API.financiero, `/api/financiero/estado-cuenta/${p.id}`)
        .catch(() => null)
    ));
    const altas = resultados.filter(r => r && r.alerta && r.alerta.nivel === 'alto');
    $('#kpiAlertasSaldo').textContent = altas.length;
    const box = $('#kpiAlertasBox');
    box.classList.remove('ok', 'warn', 'error');
    if (altas.length > 0) box.classList.add('error');
    else if (resultados.some(r => r && r.alerta)) box.classList.add('warn');
    else box.classList.add('ok');
  } catch {
    $('#kpiAlertasSaldo').textContent = '—';
  }
}

/* ============================================================
 *   PACIENTES
 * ============================================================ */

async function cargarPacientes() {
  try {
    const pacientes = await api(API.pacientes, '/api/pacientes');
    $('#contadorPacientes').textContent = `${pacientes.length} personas`;
    const rows = pacientes.map(p => `
      <tr>
        <td>
          <strong>${esc(p.nombres)} ${esc(p.apellidos)}</strong>
          <div class="tiny">${esc(p.familiarEmail || 'sin correo de familiar')}</div>
        </td>
        <td class="num">${esc(p.dpi)}</td>
        <td>${fechaCorta(p.fechaNacimiento)}</td>
        <td>${fechaCorta(p.fechaIngreso)}</td>
      </tr>`).join('');
    $('#tbodyPacientes').innerHTML = rows;
    $('#vacioPacientes').classList.toggle('hidden', pacientes.length > 0);
    // repoblar selects que dependen de pacientes
    llenarSelectPacientes($('#sPaciente'), pacientes);
    llenarSelectPacientes($('#dPaciente'), pacientes);
    llenarSelectPacientes($('#fPaciente'), pacientes);
    llenarSelectPacientes($('#cPaciente'), pacientes);
    llenarSelectPacientes($('#qPaciente'), pacientes);
  } catch (err) {
    console.error('Pacientes:', err);
  }
}

function llenarSelectPacientes(sel, pacientes) {
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">Elegir…</option>` +
    pacientes.map(p => `<option value="${p.id}">${esc(p.nombres)} ${esc(p.apellidos)} — ${esc(p.dpi)}</option>`).join('');
  if (prev) sel.value = prev;
}

async function onCrearPaciente(e) {
  e.preventDefault();
  const msg = $('#msgPaciente'); limpiar(msg);
  const body = {
    nombres: $('#pNombres').value.trim(),
    apellidos: $('#pApellidos').value.trim(),
    fechaNacimiento: $('#pFechaNac').value,
    genero: $('#pGenero').value,
    dpi: $('#pDpi').value.trim(),
    telefono: $('#pTelefono').value.trim() || null,
    contactoEmergencia: $('#pContacto').value.trim() || null,
    familiarEmail: $('#pFamiliarEmail').value.trim() || null,
    direccion: $('#pDireccion').value.trim() || null,
    padecimientos: $('#pPadecimientos').value.trim() || null
  };
  const btn = $('#btnCrearPaciente'); btn.disabled = true;
  try {
    await api(API.pacientes, '/api/pacientes', { method: 'POST', body });
    ok(msg, `Paciente ${body.nombres} ${body.apellidos} registrado.`);
    e.target.reset();
    cargarPacientes();
  } catch (err) {
    error(msg, err.message);
  } finally { btn.disabled = false; }
}

/* ============================================================
 *   SOLICITUDES
 * ============================================================ */

async function cargarSolicitudes() {
  try {
    const [solicitudes, pacientes] = await Promise.all([
      api(API.pacientes, '/api/solicitudes'),
      api(API.pacientes, '/api/pacientes')
    ]);
    const mapa = Object.fromEntries(pacientes.map(p => [p.id, `${p.nombres} ${p.apellidos}`]));
    $('#contadorSolicitudes').textContent = `${solicitudes.length} en total`;

    const puedeAsignar   = puede('coordinador_fundacion', 'admin');
    const puedeConvertir = puede('medico_especialista');
    const puedeCancelar  = puede('medico_general', 'admin');

    const rows = solicitudes.map(s => {
      const acciones = [];
      if (s.estado === 'pendiente_asignacion' && puedeAsignar)
        acciones.push(`<button class="btn-link" data-action="asignar" data-id="${s.id}">Asignar cita</button>`);
      if (s.estado === 'cita_asignada' && puedeConvertir)
        acciones.push(`<button class="btn-link" data-action="convertir" data-id="${s.id}">Iniciar visita</button>`);
      if (['pendiente_asignacion','cita_asignada','en_atencion'].includes(s.estado) && puedeCancelar)
        acciones.push(`<button class="btn-link danger" data-action="cancelar" data-id="${s.id}">Cancelar</button>`);

      const cita = s.fechaCita
        ? `${fechaCorta(s.fechaCita)}${s.horaCita ? ' · ' + formatoHora(s.horaCita) : ''}`
        : '<span class="tiny">Sin asignar</span>';

      return `<tr>
        <td>${esc(mapa[s.idPaciente] || `#${s.idPaciente}`)}</td>
        <td>${esc(s.especialidad)}<div class="tiny">${esc(s.motivo)}</div></td>
        <td>${chip(s.estado)}</td>
        <td>${cita}</td>
        <td>${acciones.join(' &middot; ') || '<span class="tiny">—</span>'}</td>
      </tr>`;
    }).join('');
    $('#tbodySolicitudes').innerHTML = rows;
    $('#vacioSolicitudes').classList.toggle('hidden', solicitudes.length > 0);

    $$('#tbodySolicitudes [data-action]').forEach(b =>
      b.addEventListener('click', () => onAccionSolicitud(b.dataset.action, Number(b.dataset.id))));

    // Deshabilitar el form si no es medico_general
    $('#btnCrearSolicitud').disabled = !puede('medico_general');
    if (!puede('medico_general')) {
      warn($('#msgSolicitud'), 'Solo un médico general puede crear una nueva solicitud.');
    } else {
      limpiar($('#msgSolicitud'));
    }
  } catch (err) {
    console.error('Solicitudes:', err);
  }
}

function formatoHora(h) {
  if (!h) return '';
  if (typeof h === 'string' && /^\d{2}:\d{2}/.test(h)) return h.slice(0,5);
  const d = new Date(h);
  return isNaN(d) ? String(h) : d.toISOString().slice(11,16);
}

async function onCrearSolicitud(e) {
  e.preventDefault();
  const msg = $('#msgSolicitud'); limpiar(msg);
  const body = {
    idPaciente: Number($('#sPaciente').value),
    especialidad: $('#sEspecialidad').value.trim().toLowerCase(),
    motivo: $('#sMotivo').value.trim()
  };
  try {
    await api(API.pacientes, '/api/solicitudes', { method: 'POST', body });
    ok(msg, `Solicitud creada. Se envió aviso automático al familiar.`);
    e.target.reset();
    cargarSolicitudes();
  } catch (err) {
    error(msg, err.message);
  }
}

async function onAccionSolicitud(accion, id) {
  if (accion === 'asignar') return promptAsignarCita(id);
  if (accion === 'convertir') return convertirEnVisita(id);
  if (accion === 'cancelar') return cancelarSolicitud(id);
}

async function promptAsignarCita(id) {
  const fechaCita = prompt('Fecha de la cita (YYYY-MM-DD)');
  if (!fechaCita) return;
  const horaCita = prompt('Hora de la cita (HH:mm)', '10:00');
  if (!horaCita) return;
  const idEsp = prompt('ID del médico especialista');
  if (!idEsp) return;
  try {
    await api(API.pacientes, `/api/solicitudes/${id}/asignar-cita`, {
      method: 'PATCH',
      body: { fechaCita, horaCita, idMedicoEspecialista: Number(idEsp) }
    });
    cargarSolicitudes();
  } catch (err) { alert(err.message); }
}

async function convertirEnVisita(id) {
  if (!confirm('¿Iniciar la visita médica para esta solicitud?')) return;
  try {
    await api(API.pacientes, `/api/solicitudes/${id}/convertir-a-visita`, { method: 'POST' });
    cargarSolicitudes();
    cambiarTab('visitas');
  } catch (err) { alert(err.message); }
}

async function cancelarSolicitud(id) {
  if (!confirm('¿Cancelar esta solicitud? Esta acción es irreversible.')) return;
  try {
    await api(API.pacientes, `/api/solicitudes/${id}/cancelar`, { method: 'PATCH' });
    cargarSolicitudes();
  } catch (err) { alert(err.message); }
}

/* ============================================================
 *   VISITAS
 * ============================================================ */

async function cargarVisitasTab() {
  try {
    const [solicitudes, pacientes] = await Promise.all([
      api(API.pacientes, '/api/solicitudes'),
      api(API.pacientes, '/api/pacientes')
    ]);
    const mapa = Object.fromEntries(pacientes.map(p => [p.id, `${p.nombres} ${p.apellidos}`]));

    // Cada solicitud en atencion/completada tiene una visita
    const withVisita = solicitudes.filter(s => ['en_atencion','completada'].includes(s.estado));
    const opciones = [];
    for (const s of withVisita) {
      try {
        const visitas = await api(API.pacientes, `/api/visitas/paciente/${s.idPaciente}`);
        const v = visitas.find(vv => vv.idSolicitudReferencia === s.id);
        if (v) opciones.push({ v, s, paciente: mapa[s.idPaciente] });
      } catch { /* ignora esta */ }
    }
    const sel = $('#selectorVisita');
    sel.innerHTML = `<option value="">Elegir visita…</option>` +
      opciones.map(({ v, s, paciente }) =>
        `<option value="${v.id}">${esc(paciente)} — ${esc(s.especialidad)} — ${chipTexto(v.estado)}</option>`
      ).join('');
    if (state.visitaSeleccionada && opciones.some(o => o.v.id === state.visitaSeleccionada)) {
      sel.value = state.visitaSeleccionada;
      cargarDetalleVisita();
    } else {
      $('#detalleVisita').classList.add('hidden');
    }
  } catch (err) {
    console.error('Visitas:', err);
  }
}

function chipTexto(estado) { return estado || '—'; }

async function cargarDetalleVisita() {
  const id = Number($('#selectorVisita').value);
  if (!id) {
    $('#detalleVisita').classList.add('hidden');
    state.visitaSeleccionada = null;
    return;
  }
  state.visitaSeleccionada = id;
  try {
    const v = await api(API.pacientes, `/api/visitas/${id}`);
    $('#detalleVisita').classList.remove('hidden');
    $('#visitaTitulo').textContent = `Visita #${v.id}`;
    $('#visitaEstadoChip').className = `chip ${v.estado}`;
    $('#visitaEstadoChip').textContent = v.estado;
    $('#visitaMeta').textContent =
      `Paciente #${v.idPaciente} · Médico especialista #${v.idMedicoEspecialista} · Fecha ${fechaHora(v.fecha)}`;
    $('#vDiagnostico').value = v.diagnostico || '';
    $('#vObservaciones').value = v.observaciones || '';

    const puedeEditar = puede('medico_especialista') && v.estado === 'en_atencion';
    $('#vDiagnostico').disabled = !puedeEditar;
    $('#vObservaciones').disabled = !puedeEditar;
    $('#btnGuardarClinico').disabled = !puedeEditar;
    $('#btnCompletarVisita').disabled = !puedeEditar;
    $('#btnAgregarExamen').disabled = !puedeEditar;
    $('#btnAgregarPrescripcion').disabled = !puedeEditar;

    $('#listaExamenes').innerHTML = (v.examenes || []).map(ex =>
      `<li>${esc(ex.tipo)} ${chip(ex.estado)}<div class="tiny">${fechaHora(ex.fechaSolicitud)}</div></li>`
    ).join('') || `<li class="tiny">Sin exámenes solicitados.</li>`;

    $('#listaPrescripciones').innerHTML = (v.prescripciones || []).map(rx =>
      `<li><strong>${esc(rx.medicamento)}</strong>${rx.dosis ? ' — ' + esc(rx.dosis) : ''} ${chip(rx.estado || 'pendiente')}
        <div class="tiny">${esc(rx.indicaciones || '')}${rx.idMedicamento ? ' · inventario #' + rx.idMedicamento : ' · sin inventario'}</div></li>`
    ).join('') || `<li class="tiny">Sin prescripciones.</li>`;

    // Cargar inventario de farmacia para la lista de medicamentos
    if (puedeEditar) {
      try {
        const meds = await api(API.farmacia, '/api/farmacia/medicamentos');
        $('#rxIdMedicamento').innerHTML =
          `<option value="">— elegir del inventario (requerido para que farmacia pueda dispensar) —</option>` +
          meds.map(m => `<option value="${m.id}">${esc(m.nombre)} — ${esc(m.presentacion || '')}</option>`).join('');
      } catch { /* el servicio de farmacia puede estar caido */ }
    }
  } catch (err) {
    error($('#msgClinico'), err.message);
  }
}

async function onGuardarClinico() {
  const msg = $('#msgClinico'); limpiar(msg);
  try {
    await api(API.pacientes, `/api/visitas/${state.visitaSeleccionada}`, {
      method: 'PATCH',
      body: {
        diagnostico: $('#vDiagnostico').value,
        observaciones: $('#vObservaciones').value
      }
    });
    ok(msg, 'Notas guardadas.');
    cargarDetalleVisita();
  } catch (err) { error(msg, err.message); }
}

async function onCompletarVisita() {
  const msg = $('#msgCompletar'); limpiar(msg);
  if (!confirm('¿Marcar la visita como completa? La solicitud enlazada también quedará cerrada.')) return;
  try {
    await api(API.pacientes, `/api/visitas/${state.visitaSeleccionada}/completar`, { method: 'POST' });
    ok(msg, 'Visita completada.');
    cargarVisitasTab();
  } catch (err) { error(msg, err.message); }
}

async function onAgregarExamen() {
  const msg = $('#msgExamen'); limpiar(msg);
  const tipo = $('#exTipo').value.trim();
  if (!tipo) return error(msg, 'Escribe el tipo de examen.');
  try {
    await api(API.pacientes, `/api/visitas/${state.visitaSeleccionada}/examenes`, {
      method: 'POST', body: { tipo }
    });
    $('#exTipo').value = '';
    ok(msg, 'Examen registrado.');
    cargarDetalleVisita();
  } catch (err) { error(msg, err.message); }
}

async function onAgregarPrescripcion() {
  const msg = $('#msgRx'); limpiar(msg);
  const idMedSel = Number($('#rxIdMedicamento').value) || null;
  const body = {
    medicamento: $('#rxMedicamento').value.trim(),
    dosis: $('#rxDosis').value.trim() || null,
    indicaciones: $('#rxIndicaciones').value.trim() || null,
    idMedicamento: idMedSel
  };
  if (!body.medicamento) return error(msg, 'Escribe el medicamento.');
  try {
    await api(API.pacientes, `/api/visitas/${state.visitaSeleccionada}/prescripciones`, {
      method: 'POST', body
    });
    $('#rxMedicamento').value = ''; $('#rxDosis').value = '';
    $('#rxIndicaciones').value = ''; $('#rxIdMedicamento').value = '';
    ok(msg, idMedSel
      ? 'Prescripción registrada y lista para dispensar.'
      : 'Prescripción registrada (sin medicamento de inventario — farmacia no podrá dispensarla hasta que se asocie).');
    cargarDetalleVisita();
  } catch (err) { error(msg, err.message); }
}

/* ============================================================
 *   FARMACIA
 * ============================================================ */

async function cargarFarmacia() {
  try {
    const [meds, pacientes] = await Promise.all([
      api(API.farmacia, '/api/farmacia/medicamentos'),
      api(API.pacientes, '/api/pacientes')
    ]);
    $('#contadorMedicamentos').textContent = `${meds.length} productos`;
    $('#tbodyMedicamentos').innerHTML = meds.map(m => `
      <tr>
        <td><strong>${esc(m.nombre)}</strong></td>
        <td class="tiny">${esc(m.presentacion || '')}</td>
        <td>${m.stock < 20 ? `<span class="chip cancelada">${m.stock} bajo</span>` : m.stock}</td>
        <td class="right num">${money(m.precioUnitario)}</td>
      </tr>`).join('');
    $('#vacioMedicamentos').classList.toggle('hidden', meds.length > 0);
    llenarSelectPacientes($('#dPaciente'), pacientes);
    if ($('#dPaciente').value) {
      await cargarPrescripcionesPendientes();
      await cargarHistorialFarmacia();
    } else {
      $('#dPrescripcion').innerHTML = `<option value="">— selecciona paciente primero —</option>`;
      $('#hintPrescripcion').textContent = '';
    }
  } catch (err) { console.error('Farmacia:', err); }
}

async function cargarPrescripcionesPendientes() {
  const id = Number($('#dPaciente').value);
  const sel = $('#dPrescripcion');
  const hint = $('#hintPrescripcion');
  if (!id) {
    sel.innerHTML = `<option value="">— selecciona paciente primero —</option>`;
    hint.textContent = '';
    return;
  }
  try {
    const prescripciones = await api(
      API.farmacia,
      `/api/farmacia/prescripciones/pendientes/paciente/${id}`
    );
    if (prescripciones.length === 0) {
      sel.innerHTML = `<option value="">— sin prescripciones pendientes —</option>`;
      sel.disabled = true;
      $('#btnDispensar').disabled = true;
      hint.textContent = 'Este paciente no tiene prescripciones pendientes. El médico especialista debe emitir una en una visita antes de que farmacia pueda dispensarla.';
    } else {
      sel.disabled = false;
      $('#btnDispensar').disabled = false;
      sel.innerHTML = `<option value="">Elegir…</option>` + prescripciones.map(p => {
        const sinMed = p.idMedicamento == null;
        const etiqueta = `${esc(p.medicamento)}${p.dosis ? ' · ' + esc(p.dosis) : ''}${sinMed ? ' (sin medicamento de inventario)' : ''}`;
        return `<option value="${p.id}" data-sinmed="${sinMed}">${etiqueta}</option>`;
      }).join('');
      hint.textContent = `${prescripciones.length} prescripción(es) pendiente(s) para este paciente.`;
    }
  } catch (err) {
    sel.innerHTML = `<option value="">— error al cargar —</option>`;
    hint.textContent = err.message;
  }
}

async function cargarHistorialFarmacia() {
  const id = Number($('#dPaciente').value);
  state.pacienteSeleccionadoFarmacia = id;
  if (!id) { $('#tbodyHistorial').innerHTML = ''; $('#totalGastado').textContent = ''; return; }
  try {
    const { dispensaciones, totalGastado } = await api(
      API.farmacia, `/api/farmacia/dispensaciones/paciente/${id}`
    );
    $('#totalGastado').textContent = `Total: ${money(totalGastado)}`;
    $('#tbodyHistorial').innerHTML = dispensaciones.map(d => `
      <tr>
        <td class="tiny">${fechaHora(d.fecha)}</td>
        <td>Medicamento #${d.idMedicamento}</td>
        <td class="num">${d.cantidad}</td>
        <td class="right num">${money(d.costoTotal)}</td>
      </tr>`).join('');
    $('#vacioHistorial').classList.toggle('hidden', dispensaciones.length > 0);
  } catch (err) { console.error(err); }
}

async function onDispensar(e) {
  e.preventDefault();
  const msg = $('#msgDispensar'); limpiar(msg);
  const idPrescripcion = Number($('#dPrescripcion').value);
  if (!idPrescripcion) return error(msg, 'Elegí una prescripción pendiente.');
  const body = {
    idPaciente: Number($('#dPaciente').value) || null,
    idPrescripcion,
    cantidad: Number($('#dCantidad').value)
  };
  try {
    const d = await api(API.farmacia, '/api/farmacia/dispensaciones', { method: 'POST', body });
    ok(msg, `Dispensado "${d.medicamento}". Costo con descuento fundación: ${money(d.costoTotal)}`);
    await cargarFarmacia();
  } catch (err) { error(msg, err.message); }
}

/* ============================================================
 *   LABORATORIO
 * ============================================================ */

async function cargarLaboratorio() {
  try {
    const ordenes = await api(API.laboratorio, '/api/laboratorio/ordenes-pendientes');
    $('#contadorOrdenes').textContent = `${ordenes.length} pendientes`;
    $('#tbodyOrdenes').innerHTML = ordenes.map(o => `
      <tr>
        <td class="num">${o.idExamen}</td>
        <td>${esc(o.pacienteNombres)} ${esc(o.pacienteApellidos)}<div class="tiny">${esc(o.pacienteDpi)}</div></td>
        <td>${esc(o.tipo)}</td>
        <td class="tiny">${fechaHora(o.fechaSolicitud)}</td>
        <td>
          <button class="btn-link" data-idx="${o.idExamen}" data-action="preparar">Seleccionar</button> ·
          <button class="btn-link" data-idx="${o.idExamen}" data-action="costo">Ver costo</button>
        </td>
      </tr>`).join('');
    $('#vacioOrdenes').classList.toggle('hidden', ordenes.length > 0);
    $$('#tbodyOrdenes [data-action]').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.action === 'preparar') {
          $('#rIdExamen').value = b.dataset.idx;
          $('#rIdExamen').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (b.dataset.action === 'costo') {
          verCostoLab(Number(b.dataset.idx));
        }
      }));
  } catch (err) { console.error('Laboratorio:', err); }
}

async function verCostoLab(idExamen) {
  try {
    const c = await api(API.laboratorio, `/api/laboratorio/examenes/${idExamen}/costo`);
    alert(
      `Examen ${c.tipo}\n\n` +
      `Precio base:  ${money(c.precioBase)}\n` +
      `Descuento fundación (${(c.porcentajeDescuento*100).toFixed(0)}%): -${money(c.descuentoFundacion)}\n` +
      `Total a facturar: ${money(c.total)}`
    );
  } catch (err) { alert(err.message); }
}

async function onRegistrarResultado(e) {
  e.preventDefault();
  const msg = $('#msgResultado'); limpiar(msg);
  const idExamen = Number($('#rIdExamen').value);
  const body = {
    tipoResultado: $('#rTipo').value,
    valorTexto: $('#rTexto').value.trim() || null,
    valorNumerico: $('#rNumerico').value === '' ? null : Number($('#rNumerico').value),
    archivoAdjunto: $('#rArchivo').value.trim() || null
  };
  try {
    await api(API.laboratorio, `/api/laboratorio/resultados/examen/${idExamen}`, { method: 'POST', body });
    ok(msg, 'Resultado registrado. La orden queda marcada como disponible.');
    e.target.reset();
    cargarLaboratorio();
  } catch (err) { error(msg, err.message); }
}

/* ============================================================
 *   FINANCIERO
 * ============================================================ */

async function cargarFinancieroTab() {
  try {
    const pacientes = await api(API.pacientes, '/api/pacientes');
    llenarSelectPacientes($('#fPaciente'), pacientes);
    llenarSelectPacientes($('#cPaciente'), pacientes);
    llenarSelectPacientes($('#qPaciente'), pacientes);
    cargarDonaciones();
    cargarDonantesSelect();
  } catch (err) { console.error(err); }
}

async function cargarEstadoCuenta() {
  const id = Number($('#fPaciente').value);
  if (!id) { $('#estadoCuentaBox').classList.add('hidden'); return; }
  try {
    const c = await api(API.financiero, `/api/financiero/estado-cuenta/${id}`);
    $('#estadoCuentaBox').classList.remove('hidden');
    $('#kpiSaldoTotal').textContent = money(c.saldoTotal);
    $('#kpiSaldoCargos').textContent = money(c.saldoCargos);
    $('#kpiSaldoCuotas').textContent = money(c.saldoCuotas);
    $('#kpiCantCargos').textContent = `${c.cargos.length} cargos`;
    $('#kpiCantCuotas').textContent = `${c.cuotas.length} cuotas`;
    $('#kpiAlerta').textContent = c.alerta ? c.alerta.mensaje : 'Sin alertas';
    $('#tbodyCargos').innerHTML = c.cargos.map(x => `
      <tr>
        <td class="tiny">${fechaHora(x.fecha)}</td>
        <td>${esc(x.concepto)}</td>
        <td>${chip(x.estado)}</td>
        <td class="right num">${money(x.monto)}</td>
      </tr>`).join('') || `<tr><td colspan="4" class="tiny">Sin cargos.</td></tr>`;
    $('#tbodyCuotas').innerHTML = c.cuotas.map(x => `
      <tr>
        <td>${x.mes}/${x.anio}</td>
        <td>${chip(x.estado)}</td>
        <td class="tiny">${x.fechaPago ? fechaCorta(x.fechaPago) : '—'}</td>
        <td class="right num">${money(x.monto)}</td>
      </tr>`).join('') || `<tr><td colspan="4" class="tiny">Sin cuotas.</td></tr>`;
  } catch (err) { console.error(err); }
}

async function onRegistrarCargo(e) {
  e.preventDefault();
  const msg = $('#msgCargo'); limpiar(msg);
  const body = {
    idPaciente: Number($('#cPaciente').value),
    concepto: $('#cConcepto').value.trim(),
    monto: Number($('#cMonto').value)
  };
  try {
    await api(API.financiero, '/api/financiero/cargos', { method: 'POST', body });
    ok(msg, 'Cargo registrado.');
    e.target.reset();
    if (Number($('#fPaciente').value) === body.idPaciente) cargarEstadoCuenta();
  } catch (err) { error(msg, err.message); }
}

async function onRegistrarCuota(e) {
  e.preventDefault();
  const msg = $('#msgCuota'); limpiar(msg);
  const body = {
    idPaciente: Number($('#qPaciente').value),
    mes: Number($('#qMes').value),
    anio: Number($('#qAnio').value),
    monto: Number($('#qMonto').value)
  };
  try {
    await api(API.financiero, '/api/financiero/pagos-cuota', { method: 'POST', body });
    ok(msg, 'Pago de cuota registrado.');
    e.target.reset();
    if (Number($('#fPaciente').value) === body.idPaciente) cargarEstadoCuenta();
  } catch (err) { error(msg, err.message); }
}

async function cargarDonaciones() {
  try {
    const list = await api(API.financiero, '/api/financiero/donaciones');
    $('#contadorDonaciones').textContent = `${list.length} registradas`;
    $('#tbodyDonaciones').innerHTML = list.map(d => `
      <tr>
        <td class="tiny">${fechaHora(d.fecha)}</td>
        <td>${esc(d.donante)}</td>
        <td>${esc(d.tipo)}</td>
        <td class="tiny">${esc(d.concepto || '')}</td>
        <td class="right num">${money(d.monto)}</td>
      </tr>`).join('');
    $('#vacioDonaciones').classList.toggle('hidden', list.length > 0);
  } catch (err) { console.error(err); }
}

async function cargarDonantesSelect() {
  try {
    const list = await api(API.financiero, '/api/financiero/donantes');
    $('#ddDonante').innerHTML = `<option value="">Elegir…</option>` +
      list.map(d => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('');
  } catch (err) { console.error(err); }
}

async function onRegistrarDonante(e) {
  e.preventDefault();
  const msg = $('#msgDonante'); limpiar(msg);
  const body = {
    nombre: $('#dnNombre').value.trim(),
    telefono: $('#dnTelefono').value.trim() || null,
    email: $('#dnEmail').value.trim() || null
  };
  try {
    await api(API.financiero, '/api/financiero/donantes', { method: 'POST', body });
    ok(msg, 'Donante guardado.');
    e.target.reset();
    cargarDonantesSelect();
  } catch (err) { error(msg, err.message); }
}

async function onRegistrarDonacion(e) {
  e.preventDefault();
  const msg = $('#msgDonacion'); limpiar(msg);
  const body = {
    idDonante: Number($('#ddDonante').value),
    monto: Number($('#ddMonto').value),
    tipo: $('#ddTipo').value,
    concepto: $('#ddConcepto').value.trim() || null
  };
  try {
    await api(API.financiero, '/api/financiero/donaciones', { method: 'POST', body });
    ok(msg, 'Donación registrada.');
    e.target.reset();
    cargarDonaciones();
  } catch (err) { error(msg, err.message); }
}

/* ============================================================
 *   REPORTES
 * ============================================================ */

async function generarReporte(formato) {
  const msg = $('#msgReporte'); limpiar(msg);
  const tipo = $('#repTipo').value;
  const desde = $('#repDesde').value;
  const hasta = $('#repHasta').value;
  if (!desde || !hasta) return error(msg, 'Debes elegir un rango de fechas.');

  const qs = new URLSearchParams({ desde, hasta, formato }).toString();
  const url = `${API.reportes}/api/reportes/${tipo}?${qs}`;

  if (formato === 'json') {
    try {
      const rep = await api(API.reportes, `/api/reportes/${tipo}?${qs}`);
      pintarReporteJson(rep);
    } catch (err) { error(msg, err.message); }
    return;
  }

  // pdf / excel: descarga con fetch para poder pasar Authorization
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!resp.ok) throw new Error(`Descarga falló: ${resp.status}`);
    const blob = await resp.blob();
    const nombre = `${tipo}-${desde}_a_${hasta}.${formato === 'excel' ? 'xlsx' : 'pdf'}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombre;
    link.click();
    URL.revokeObjectURL(link.href);
    ok(msg, `Descargado ${nombre}.`);
  } catch (err) { error(msg, err.message); }
}

function pintarReporteJson(rep) {
  $('#repResultCard').classList.remove('hidden');
  $('#repResultTitulo').textContent = rep.titulo;
  $('#repResultMeta').textContent =
    `Período ${rep.filtros?.desde || ''} a ${rep.filtros?.hasta || ''} · ${rep.filas.length} filas`;
  $('#repThead').innerHTML = rep.columnas.map(c =>
    `<th class="${c.tipo === 'moneda' ? 'right' : ''}">${esc(c.label)}</th>`).join('');
  $('#repTbody').innerHTML = rep.filas.map(f => `<tr>${
    rep.columnas.map(c => {
      const v = f[c.key];
      if (c.tipo === 'moneda') return `<td class="right num">${money(v)}</td>`;
      if (c.tipo === 'fecha')  return `<td class="tiny">${fechaCorta(v)}</td>`;
      return `<td>${esc(v)}</td>`;
    }).join('')
  }</tr>`).join('') || `<tr><td colspan="${rep.columnas.length}" class="tiny">Sin datos en el rango elegido.</td></tr>`;
  $('#repTfoot').innerHTML = rep.totales
    ? `<tr>${rep.columnas.map((c, i) => {
        const t = rep.totales[c.key];
        if (i === 0 && t == null) return `<td><strong>Total</strong></td>`;
        if (t == null) return `<td></td>`;
        return `<td class="right num"><strong>${c.tipo === 'moneda' ? money(t) : t}</strong></td>`;
      }).join('')}</tr>`
    : '';
}
