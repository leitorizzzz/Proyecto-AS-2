#!/usr/bin/env node
/*
 * Pruebas de INTERFAZ de los casos que el SQA reporto como no cumplidos
 * (1, 9, 14, 15, 18, 19, 21, 22, 24). El SQA prueba en el navegador, como
 * usuario, contra el "Resultado esperado" de su plan; este script hace lo
 * mismo con Playwright (Chromium headless) y deja capturas en
 * docs/capturas/sqa/<caso>-<fase>-<paso>.png.
 *
 * Los datos previos (paciente, solicitud, visita, medicamento) se preparan
 * por API para no depender de la demo; la ACCION que evalua el SQA siempre
 * se hace por la pantalla. Solo stack local (crea registros "UI ...").
 *
 * Uso:
 *   npm run test:ui                       (todos los casos, fase "despues")
 *   node scripts/ui-sqa.js --fase antes 1 9 14
 *   BASE_URL=http://localhost:8090 node scripts/ui-sqa.js
 *
 * Sale con codigo 1 si algun caso no cumple su resultado esperado.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const SVC = `${BASE}/svc`;
const DIR = path.join(__dirname, '..', 'docs', 'capturas', 'sqa');
const args = process.argv.slice(2);
const FASE = args.includes('--fase') ? args[args.indexOf('--fase') + 1] : 'despues';
const CASOS = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--fase').map(Number);
const TS = Date.now();
const CUENTAS = {
  admin: ['admin@asilo.gt', 'Admin12345'],
  mg: ['medico.general@asilo.gt', 'Demo1234'],
  esp: ['especialista@asilo.gt', 'Demo1234'],
  coord: ['coordinador@asilo.gt', 'Demo1234'],
  enf: ['enfermeria@asilo.gt', 'Demo1234'],
  far: ['farmacia@asilo.gt', 'Demo1234'],
  lab: ['laboratorio@asilo.gt', 'Demo1234']
};

// ---------------------------------------------------------------- API (preparacion)
const tokens = {};
async function api(metodo, ruta, { token, body } = {}) {
  const r = await fetch(`${SVC}/${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text(); let data = t; try { data = t ? JSON.parse(t) : null; } catch {}
  return { status: r.status, data };
}
async function token(rol) {
  if (!tokens[rol]) {
    const [email, password] = CUENTAS[rol];
    const r = await api('POST', 'auth/api/auth/login', { body: { email, password } });
    if (r.status !== 200) throw new Error(`login ${rol}: ${r.status} ${JSON.stringify(r.data)}`);
    tokens[rol] = r.data.token;
  }
  return tokens[rol];
}
async function exigirApi(metodo, ruta, rol, body, esperado) {
  const r = await api(metodo, ruta, { token: await token(rol), body });
  if (esperado && r.status !== esperado) throw new Error(`${metodo} ${ruta}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
const dpi = n => String(TS + n).slice(-13).padStart(13, '3');
const diaGt = n => new Date(Date.now() - 6 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

/** Paciente con familiar completo (alta por API). */
async function nuevoPaciente(etiqueta, n) {
  return exigirApi('POST', 'pacientes/api/pacientes', 'admin', {
    nombres: 'UI', apellidos: `${etiqueta} ${TS}`, fechaNacimiento: '1942-03-03', genero: 'F', dpi: dpi(n),
    familiar: { nombres: 'Ana', apellidos: `Familiar ${etiqueta}`, dpi: dpi(500 + n), parentesco: 'hija',
                telefono: '55550000', email: `ui.familiar${n}@example.com`, direccion: 'Mazatenango' }
  }, 201);
}
/** Paciente -> solicitud -> cita -> visita en atencion. */
async function visitaAbierta(etiqueta, n, especialidad = 'cardiologia') {
  const p = await nuevoPaciente(etiqueta, n);
  const enf = (await exigirApi('GET', 'auth/api/auth/me', 'enf')).id;
  const esp = (await exigirApi('GET', 'auth/api/auth/me', 'esp')).id;
  const s = await exigirApi('POST', 'pacientes/api/solicitudes', 'mg',
    { idPaciente: p.id, especialidad, motivo: `Prueba de interfaz ${etiqueta}`, idEnfermero: enf }, 201);
  await exigirApi('PATCH', `pacientes/api/solicitudes/${s.id}/asignar-cita`, 'coord',
    { fechaCita: diaGt(3), horaCita: '09:30', idMedicoEspecialista: esp }, 200);
  const v = await exigirApi('POST', `pacientes/api/solicitudes/${s.id}/convertir-a-visita`, 'esp', null, 201);
  return { paciente: p, solicitud: s, visita: v };
}
async function medicamento(etiqueta, precio = 2.5, stock = 100) {
  return exigirApi('POST', 'farmacia/api/farmacia/medicamentos', 'far',
    { nombre: `UI ${etiqueta} ${TS}`, presentacion: 'tableta', stock, precioUnitario: precio }, 201);
}

// ---------------------------------------------------------------- navegador
let browser;
async function pagina({ movil = false } = {}) {
  const ctx = await browser.newContext(movil
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push(e.message));
  // "Failed to load resource" es el registro de Chrome de una respuesta 4xx
  // esperada (409, 400), no un error de JavaScript.
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errores.push(m.text()); });
  return page;
}
async function entrar(page, rol) {
  const [email, password] = CUENTAS[rol];
  await page.goto(`${BASE}/`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#btnLogin');
  await page.waitForSelector('#vistaApp:not(.hidden)', { timeout: 15000 });
  await page.waitForTimeout(600);
}
async function seccion(page, tab) {
  if (await page.isVisible('#btnMenu')) { await page.click('#btnMenu'); await page.waitForTimeout(250); }
  await page.click(`.tab[data-tab="${tab}"]`);
  await page.waitForTimeout(1500);
  // Estructura: todas las secciones dentro de main.stage y solo una visible
  // (un </div> de mas dejo Financiero pegado debajo del Panel).
  const estructura = await page.evaluate(() => ({
    fuera: [...document.querySelectorAll('#vistaApp section')].filter(s => !s.closest('main.stage')).map(s => s.id),
    visibles: [...document.querySelectorAll('#vistaApp section')].filter(s => !s.classList.contains('hidden')).map(s => s.id)
  }));
  if (estructura.fuera.length || estructura.visibles.length !== 1) {
    throw new Error(`estructura rota al abrir ${tab}: fuera de main ${estructura.fuera.join(',') || '—'}; visibles ${estructura.visibles.join(',')}`);
  }
}
async function captura(page, caso, paso, opciones = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const archivo = path.join(DIR, `caso${String(caso).padStart(2, '0')}-${FASE}-${paso}.png`);
  await page.screenshot({ path: archivo, fullPage: opciones.completa !== false });
  return path.relative(path.join(__dirname, '..'), archivo).replace(/\\/g, '/');
}
const texto = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
async function visible(page, sel) { return page.locator(sel).first().isVisible().catch(() => false); }

/** Elige una opcion de un <select> por el texto visible (parcial). */
async function elegir(page, sel, contiene) {
  // Las listas se llenan con datos de la API: espera a que aparezca la opcion.
  await page.waitForFunction(([s, c]) => {
    const el = document.querySelector(s);
    return el && [...el.options].some(x => x.textContent.includes(c));
  }, [sel, contiene], { timeout: 10000 }).catch(() => {});
  const valor = await page.$eval(sel, (s, c) => {
    const o = [...s.options].find(x => x.textContent.includes(c));
    return o ? o.value : null;
  }, contiene);
  if (valor == null) throw new Error(`${sel}: no hay opcion con "${contiene}"`);
  await page.selectOption(sel, valor);
  await page.waitForTimeout(900);
}

// ---------------------------------------------------------------- casos
const CASO = {};

CASO[1] = async () => {
  const f = [], ev = [];
  const page = await pagina();
  await entrar(page, 'admin');
  const tokenSesion = await page.evaluate(() => localStorage.getItem('asilo.token'));
  await seccion(page, 'pacientes');
  ev.push(await captura(page, 1, '1-sesion-abierta', { completa: false }));
  await page.click('#btnSalir');
  await page.waitForTimeout(800);
  ev.push(await captura(page, 1, '2-tras-salir', { completa: false }));

  const estado = await page.evaluate(() => ({
    local: Object.keys(localStorage), sesion: Object.keys(sessionStorage),
    email: document.querySelector('#email').value, password: document.querySelector('#password').value,
    emailAttr: document.querySelector('#email').getAttribute('value'),
    autoPass: document.querySelector('#password').getAttribute('autocomplete'),
    usuario: typeof state !== 'undefined' ? state.usuario : null,
    tokenMem: typeof state !== 'undefined' ? state.token : null,
    appVisible: !document.querySelector('#vistaApp').classList.contains('hidden'),
    datosUsuario: document.querySelector('#usuarioNombre')?.textContent
  }));
  if (estado.local.length) f.push(`localStorage no queda vacío: ${estado.local.join(', ')}`);
  if (estado.sesion.length) f.push(`sessionStorage no queda vacío: ${estado.sesion.join(', ')}`);
  if (estado.email || estado.emailAttr) f.push(`el correo sigue escrito en el formulario de acceso ("${estado.email || estado.emailAttr}")`);
  if (estado.password) f.push('la contraseña sigue en el formulario de acceso');
  if (estado.autoPass !== 'current-password') f.push(`autocomplete de la contraseña = ${estado.autoPass}`);
  if (estado.usuario || estado.tokenMem) f.push('el usuario o el token siguen en memoria');
  if (estado.appVisible) f.push('la aplicación sigue visible');
  if (estado.datosUsuario && estado.datosUsuario !== '—') f.push(`el nombre del usuario sigue en la página oculta ("${estado.datosUsuario}")`);

  await page.goBack(); await page.waitForTimeout(800);
  const trasAtras = await page.evaluate(() => !document.querySelector('#vistaApp').classList.contains('hidden'));
  ev.push(await captura(page, 1, '3-boton-atras', { completa: false }));
  if (trasAtras) f.push('el botón Atrás vuelve a mostrar una pantalla protegida');

  const cab = await fetch(`${BASE}/`).then(r => r.headers.get('cache-control'));
  if (!/no-store/.test(cab || '')) f.push(`la página no lleva Cache-Control no-store (${cab})`);

  const conViejo = await fetch(`${SVC}/pacientes/api/pacientes`, { headers: { Authorization: `Bearer ${tokenSesion}` } });
  if (conViejo.status !== 401) f.push(`el token de la sesión cerrada sigue sirviendo (GET pacientes -> ${conViejo.status})`);

  // Cierre por inactividad: misma limpieza
  await entrar(page, 'enf');
  await page.evaluate(() => iniciarControlInactividad({ limiteMs: 1500, avisoMs: 500 }));
  await page.waitForTimeout(4500);
  const inact = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter(k => k !== 'asilo.motivoSalida'), email: document.querySelector('#email').value,
    password: document.querySelector('#password').value, app: !document.querySelector('#vistaApp').classList.contains('hidden')
  }));
  ev.push(await captura(page, 1, '4-inactividad', { completa: false }));
  if (inact.app) f.push('tras la inactividad la aplicación sigue visible');
  if (inact.local.length || inact.email || inact.password) f.push(`tras la inactividad quedan datos (storage: ${inact.local.join(',') || '—'}, correo: "${inact.email}")`);
  if (page.errores.length) f.push(`errores en consola: ${page.errores.slice(0, 2).join(' | ')}`);
  return { f, ev };
};

CASO[9] = async () => {
  const f = [], ev = [];
  const p = await nuevoPaciente('RN02', 9);
  const enf = (await exigirApi('GET', 'auth/api/auth/me', 'enf')).id;
  const activa = await exigirApi('POST', 'pacientes/api/solicitudes', 'mg',
    { idPaciente: p.id, especialidad: 'neurologia', motivo: 'Temblor en reposo', idEnfermero: enf }, 201);
  const page = await pagina();
  await entrar(page, 'mg');
  await seccion(page, 'solicitudes');
  // Antes del arreglo la lista de pacientes de la solicitud solo se llenaba
  // al visitar Pacientes: si esta vacia se reporta y se toma el camino del SQA.
  const opciones = await page.$$eval('#sPaciente option', os => os.length);
  if (opciones <= 1) {
    f.push('la lista de pacientes de "Nueva solicitud" está vacía si no se visitó antes la sección Pacientes');
    await seccion(page, 'pacientes');
    await seccion(page, 'solicitudes');
  }
  await elegir(page, '#sPaciente', `RN02 ${TS}`);
  await page.fill('#sEspecialidad', 'neurologia');
  await page.selectOption('#sEnfermero', String(enf));
  await page.fill('#sMotivo', 'Segunda referencia por el mismo motivo');
  await page.click('#btnCrearSolicitud');
  await page.waitForTimeout(1500);
  ev.push(await captura(page, 9, '1-duplicada', { completa: false }));
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('#dlg');
    return d.open ? { titulo: d.querySelector('#dlgTitulo').innerText, cuerpo: d.innerText,
                      enlace: !!d.querySelector('[data-ver-solicitud], a, button.btn-link') } : null;
  });
  if (!dlg) {
    f.push('no se despliega una alerta (diálogo) de duplicidad; solo hay un texto bajo el formulario: ' +
      `"${(await texto(page, '#msgSolicitud')).slice(0, 120)}"`);
  } else {
    for (const [que, re] of [['número de la solicitud activa', new RegExp(`#?${activa.id}\\b`)], ['especialidad', /neurolog/i],
                             ['estado', /pendiente de cita/i], ['fecha', /\d{1,2}\s\w+\.?\s\d{4}|\d{4}-\d{2}-\d{2}/], ['médico', /Dr|Dra|médic/i]]) {
      if (!re.test(dlg.cuerpo)) f.push(`la alerta no muestra ${que}`);
    }
    if (!/Ver solicitud activa/i.test(dlg.cuerpo)) f.push('la alerta no tiene el enlace "Ver solicitud activa"');
    else {
      await page.click('#dlg >> text=Ver solicitud activa');
      await page.waitForTimeout(1200);
      ev.push(await captura(page, 9, '2-ver-activa', { completa: false }));
      const resaltada = await page.locator(`#tbodySolicitudes tr.fila-resaltada`).count();
      if (!resaltada) f.push('"Ver solicitud activa" no lleva a la solicitud en la bandeja');
    }
  }
  if (page.errores.length) f.push(`errores en consola: ${page.errores.slice(0, 2).join(' | ')}`);
  return { f, ev };
};

CASO[14] = async () => {
  const f = [], ev = [];
  const { visita } = await visitaAbierta('Visita14', 14, 'geriatria');
  const med = await medicamento('Losartan14', 1.5);
  const page = await pagina();
  await entrar(page, 'esp');
  await seccion(page, 'visitas');
  await page.selectOption('#selectorVisita', String(visita.id));
  await page.waitForTimeout(1500);
  // Lo que hizo el SQA: escribe diagnostico, deja observaciones vacias, escribe
  // un examen y una prescripcion sin pulsar sus botones, y finaliza.
  await page.fill('#vDiagnostico', 'Hipertensión arterial estadio 1');
  await page.fill('#exTipo', 'Electrocardiograma de 12 derivaciones');
  await page.selectOption('#rxIdMedicamento', String(med.id));
  await page.fill('#rxDosis', '50 mg cada 24 h');   // falta la cantidad: prescripcion a medio llenar
  ev.push(await captura(page, 14, '1-antes-de-finalizar'));
  const botones = await page.$$eval('#detalleVisita button', bs => bs.filter(b => b.offsetParent).map(b => b.textContent.trim()));
  const finalizar = await page.$('#btnFinalizarVisita');
  if (!finalizar) {
    f.push(`no hay un botón único "Finalizar visita"; la pantalla tiene: ${botones.join(' / ')}`);
    await page.click('#btnCompletarVisita');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => document.querySelector('#dlg').open)) { await page.click('#dlgConfirmar'); await page.waitForTimeout(1500); }
    if (await page.evaluate(() => document.querySelector('#dlg').open)) { ev.push(await captura(page, 14, '2-rechazo')); await page.click('#dlgCancelar'); await page.waitForTimeout(1200); }
  } else {
    await finalizar.click();
    await page.waitForTimeout(2500);
  }
  ev.push(await captura(page, 14, '3-tras-finalizar'));
  const r = await page.evaluate(() => ({
    resumen: document.querySelector('#resumenFaltantes')?.innerText || document.querySelector('#msgCompletar')?.innerText || '',
    obsMarcada: document.querySelector('#vObservaciones').classList.contains('campo-faltante'),
    rxMarcada: document.querySelector('#rxCantidad').classList.contains('campo-faltante'),
    chip: document.querySelector('#visitaEstadoChip').innerText,
    opcion: document.querySelector('#selectorVisita').selectedOptions[0]?.textContent || '',
    examenes: document.querySelector('#listaExamenes').innerText,
    diag: document.querySelector('#vDiagnostico').value
  }));
  const v = await exigirApi('GET', `pacientes/api/visitas/${visita.id}`, 'esp');
  if (v.diagnostico !== 'Hipertensión arterial estadio 1') f.push('el diagnóstico escrito no se guardó al finalizar');
  if (!(v.examenes || []).some(e => /Electrocardiograma/.test(e.tipo))) f.push('el examen escrito pero no agregado se ignoró');
  if (!/observaciones/i.test(r.resumen)) f.push(`el resumen no dice que faltan las observaciones ("${r.resumen.slice(0, 100)}")`);
  if (!/prescripci/i.test(r.resumen)) f.push('no avisa de la prescripción a medio llenar');
  if (!r.obsMarcada) f.push('el campo observaciones no queda resaltado');
  if (!r.rxMarcada) f.push('la cantidad de la prescripción a medio llenar no queda resaltada');
  if (v.estado !== 'incompleta') f.push(`la visita quedó en estado "${v.estado}", no INCOMPLETA`);
  if (!/incompleta/i.test(r.chip)) f.push(`el estado en la visita dice "${r.chip}"`);
  if (!/incompleta/i.test(r.opcion)) f.push(`el listado de visitas dice "${r.opcion}"`);
  // Segunda vuelta: completa todo y finaliza con el mismo boton.
  if (finalizar) {
    await page.fill('#vObservaciones', 'Control en 30 días, dieta hiposódica');
    await page.fill('#rxCantidad', '30');
    await page.click('#btnFinalizarVisita');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => document.querySelector('#dlg').open)) await page.click('#dlgConfirmar');
    await page.waitForTimeout(2500);
    ev.push(await captura(page, 14, '4-completada'));
    const v2 = await exigirApi('GET', `pacientes/api/visitas/${visita.id}`, 'esp');
    if (v2.estado !== 'completada') f.push(`con todo lleno la visita quedó "${v2.estado}"`);
    if (!(v2.prescripciones || []).some(x => x.cantidadPrescrita === 30)) f.push('la prescripción completada no se guardó al finalizar');
  }
  if (page.errores.length) f.push(`errores en consola: ${page.errores.slice(0, 2).join(' | ')}`);
  return { f, ev };
};

CASO[15] = async () => {
  const f = [], ev = [];
  const { visita, paciente } = await visitaAbierta('Lab15', 15, 'cardiologia');
  const page = await pagina();
  await entrar(page, 'esp');
  await seccion(page, 'visitas');
  await page.selectOption('#selectorVisita', String(visita.id));
  await page.waitForTimeout(1500);
  await page.fill('#exTipo', 'Electrocardiograma de 12 derivaciones');
  await page.waitForTimeout(600);
  ev.push(await captura(page, 15, '1-al-ordenar'));
  const vistaPrevia = await texto(page, '#precioExamen');
  if (!/200\.00/.test(vistaPrevia) || !/160\.00/.test(vistaPrevia)) f.push(`al ordenar no se ve el precio base y el costo con descuento ("${vistaPrevia}")`);
  await page.click('#btnAgregarExamen');
  await page.waitForTimeout(1800);
  ev.push(await captura(page, 15, '2-en-la-visita'));
  const enVisita = await texto(page, '#listaExamenes');
  for (const [que, re] of [['precio base', /precio base\D*200\.00/i], ['descuento 20 %', /20\s?%/], ['monto del descuento', /40\.00/], ['costo con descuento', /160\.00/], ['estado pendiente', /pendiente/i]])
    if (!re.test(enVisita)) f.push(`en la visita el examen no muestra ${que}`);
  await page.close();
  const lab = await pagina();
  await entrar(lab, 'lab');
  await seccion(lab, 'laboratorio');
  ev.push(await captura(lab, 15, '3-laboratorio'));
  const fila = await lab.locator('#tbodyOrdenes tr', { hasText: `Lab15 ${TS}` }).first().innerText().catch(() => '');
  for (const [que, re] of [['precio base', /200\.00/], ['costo con descuento', /160\.00/], ['estado', /pendiente/i]])
    if (!re.test(fila)) f.push(`en Laboratorio la orden no muestra ${que} ("${fila.replace(/\s+/g, ' ').slice(0, 120)}")`);
  const rep = await exigirApi('GET', `reportes/api/reportes/examenes?desde=${diaGt(-1)}&hasta=${diaGt(0)}`, 'admin');
  const cols = rep.columnas.map(c => c.label).join(', ');
  for (const que of ['Precio base', 'Descuento', 'Costo', 'Estado']) if (!cols.includes(que)) f.push(`el reporte de exámenes no tiene la columna "${que}" (${cols})`);
  const filaRep = rep.filas.find(x => x.paciente && x.paciente.includes(`Lab15 ${TS}`));
  if (filaRep && (Number(filaRep.precioBase) !== 200 || Number(filaRep.costo) !== 160)) f.push('el reporte de exámenes no trae 200 / 160');
  const v = await exigirApi('GET', `pacientes/api/visitas/${visita.id}`, 'esp');
  void paciente; void v;
  return { f, ev };
};

CASO[18] = async () => {
  const f = [], ev = [];
  const { visita, paciente } = await visitaAbierta('Farm18', 18, 'cardiologia');
  const med = await medicamento('Amlodipino18', 2.5, 100);
  await exigirApi('POST', `pacientes/api/visitas/${visita.id}/prescripciones`, 'esp',
    { medicamento: med.nombre, dosis: '5 mg cada 24 h', idMedicamento: med.id, cantidadPrescrita: 10 }, 201);
  const page = await pagina();
  await entrar(page, 'far');
  await seccion(page, 'farmacia');
  await elegir(page, '#dPaciente', `Farm18 ${TS}`);
  await elegir(page, '#dPrescripcion', med.nombre);
  await page.fill('#dCantidad', '4');
  await page.click('#btnDispensar');
  await page.waitForTimeout(2000);
  ev.push(await captura(page, 18, '1-farmacia-tras-despacho'));
  const pend = await page.$eval('#dPrescripcion', s => [...s.options].map(o => o.textContent).join(' | '));
  const lista = await texto(page, '#listaPrescripcionesPaciente');
  if (!/parcial/i.test(pend + lista) || !/4 de 10/.test(pend + lista)) f.push(`en Farmacia la prescripción no se ve "Parcial · 4 de 10" ("${(lista || pend).slice(0, 120)}")`);
  const hist = await texto(page, '#tbodyHistorial');
  if (!hist.includes(med.nombre)) f.push(`el historial no nombra el medicamento ("${hist.replace(/\s+/g, ' ').slice(0, 80)}")`);
  if (!/8\.00/.test(hist)) f.push('el despacho no se lista con su costo con descuento (4 × Q2.50 − 20 % = Q8.00)');
  if (!/10\.00/.test(hist) || !/2\.00/.test(hist)) f.push('el historial no muestra precio base y descuento del despacho');
  await page.close();
  const esp = await pagina();
  await entrar(esp, 'esp');
  await seccion(esp, 'visitas');
  await esp.selectOption('#selectorVisita', String(visita.id));
  await esp.waitForTimeout(1500);
  ev.push(await captura(esp, 18, '2-visita'));
  const meta = await texto(esp, '#detalleVisita');
  if (!/farmacia\D*8\.00/i.test(meta)) f.push('la visita no muestra el costo de farmacia acumulado (Q8.00)');
  if (!/parcial/i.test(meta) || !/4 de 10/.test(meta)) f.push('la visita no muestra la prescripción "Parcial · 4 de 10"');
  void paciente;
  return { f, ev };
};

CASO[19] = async () => {
  const f = [], ev = [];
  // (A) despachar y luego cerrar; (B) cerrar y luego despachar;
  // (C) despacho parcial y cierre; (D) prescrito sin despachar al cerrar.
  const med = await medicamento('Metformina19', 3, 200);
  const escenarios = {};
  for (const [clave, n] of [['A', 191], ['B', 192], ['C', 193], ['D', 194]]) {
    const x = await visitaAbierta(`Cierre19${clave}`, n, 'endocrinologia');
    const rx = await exigirApi('POST', `pacientes/api/visitas/${x.visita.id}/prescripciones`, 'esp',
      { medicamento: med.nombre, dosis: '850 mg cada 12 h', idMedicamento: med.id, cantidadPrescrita: 10 }, 201);
    await exigirApi('PATCH', `pacientes/api/visitas/${x.visita.id}`, 'esp',
      { diagnostico: 'Diabetes tipo 2', observaciones: 'Control en 3 meses' }, 200);
    escenarios[clave] = { ...x, rx };
  }
  const far = await pagina(), esp = await pagina(), adm = await pagina();
  await entrar(far, 'far'); await entrar(esp, 'esp'); await entrar(adm, 'admin');
  const despachar = async (clave, cantidad) => {
    await seccion(far, 'farmacia');
    await elegir(far, '#dPaciente', `Cierre19${clave} ${TS}`);
    await elegir(far, '#dPrescripcion', med.nombre);
    await far.fill('#dCantidad', String(cantidad));
    await far.click('#btnDispensar');
    await far.waitForTimeout(1800);
  };
  const cerrar = async (clave) => {
    await seccion(esp, 'visitas');
    await esp.selectOption('#selectorVisita', String(escenarios[clave].visita.id));
    await esp.waitForTimeout(1500);
    const boton = (await esp.$('#btnFinalizarVisita')) ? '#btnFinalizarVisita' : '#btnCompletarVisita';
    await esp.click(boton); await esp.waitForTimeout(700);
    if (await esp.evaluate(() => document.querySelector('#dlg').open)) await esp.click('#dlgConfirmar');
    await esp.waitForTimeout(2500);
  };
  await despachar('A', 10); await cerrar('A');
  await cerrar('B'); await despachar('B', 10);
  await despachar('C', 4); await cerrar('C');
  await cerrar('D');
  ev.push(await captura(esp, 19, '1-visita-D-cerrada'));
  for (const clave of ['A', 'B', 'C', 'D']) {
    await seccion(adm, 'financiero');
    await elegir(adm, '#fPaciente', `Cierre19${clave} ${TS}`);
    await adm.waitForTimeout(1200);
    ev.push(await captura(adm, 19, `2-cuenta-${clave}`));
    const cuenta = await texto(adm, '#estadoCuentaBox');
    const api_ = await exigirApi('GET', `financiero/api/financiero/estado-cuenta/${escenarios[clave].paciente.id}`, 'admin');
    const farm = api_.cargos.flatMap(c => c.detalles || []).filter(d => d.rubro === 'farmacia').reduce((a, d) => a + Number(d.monto), 0);
    const esperado = { A: 24, B: 24, C: 9.6, D: 0 }[clave];
    if (Math.abs(farm - esperado) > 0.001) f.push(`(${clave}) farmacia cobrada al familiar Q${farm.toFixed(2)}, se esperaba Q${esperado.toFixed(2)}`);
    if (!/consulta/i.test(cuenta) || !/laboratorio/i.test(cuenta) || !/farmacia/i.test(cuenta)) f.push(`(${clave}) la cuenta no muestra el desglose consulta / laboratorio / farmacia`);
    if (Math.abs(Number(api_.saldoTotal) - (120 + esperado)) > 0.001) f.push(`(${clave}) saldo Q${api_.saldoTotal}, se esperaba Q${(120 + esperado).toFixed(2)}`);
    if (clave === 'C' || clave === 'D') {
      if (!/pendiente de cobro|por cobrar|se cobrar[áa] al despachar/i.test(cuenta)) f.push(`(${clave}) la cuenta no aclara lo que queda pendiente de cobrar al despachar`);
    }
    const v = await exigirApi('GET', `pacientes/api/visitas/${escenarios[clave].visita.id}`, 'esp');
    if (v.estado !== 'completada') f.push(`(${clave}) la visita quedó "${v.estado}"`);
  }
  await seccion(esp, 'visitas');
  await esp.selectOption('#selectorVisita', String(escenarios.A.visita.id));
  await esp.waitForTimeout(1500);
  ev.push(await captura(esp, 19, '3-visita-A-completada'));
  const vA = await texto(esp, '#detalleVisita');
  if (!/completada/i.test(vA)) f.push('la visita no muestra el estado COMPLETA');
  if (!/total cobrado/i.test(vA)) f.push('la visita no muestra el total cobrado');
  return { f, ev };
};

CASO[21] = async () => {
  const f = [], ev = [];
  const page = await pagina();
  await entrar(page, 'admin');
  ev.push(await captura(page, 21, '1-panel-admin-al-entrar'));
  const panel = await texto(page, '#tabDashboard');
  if (!/naranja/i.test(panel) || !/roja/i.test(panel)) f.push('al entrar como admin no se ven alertas naranja y roja (la demo no trae cuotas vencidas)');
  // Emitir una cuota vencida desde la UI (fecha pasada) y verla en el panel.
  const p = await nuevoPaciente('Cuota21', 21);
  await seccion(page, 'financiero');
  await elegir(page, '#qPaciente', `Cuota21 ${TS}`);
  await page.fill('#qMes', '8'); await page.fill('#qAnio', '2026'); await page.fill('#qMonto', '850');
  await page.fill('#qVence', diaGt(-45));
  await page.click('#btnEmitirCuota');
  await page.waitForTimeout(1500);
  ev.push(await captura(page, 21, '2-emitir-cuota-vencida'));
  const msg = await texto(page, '#msgCuota');
  if (!/emitida/i.test(msg)) f.push(`no se pudo emitir la cuota con fecha pasada desde la UI ("${msg}")`);
  await seccion(page, 'dashboard');
  await page.waitForTimeout(1500);
  ev.push(await captura(page, 21, '3-panel-con-alerta'));
  const fila = await page.locator('#tbodyAlertasCobro tr', { hasText: `Cuota21 ${TS}` }).first().innerText().catch(() => '');
  for (const [que, re] of [['nivel "Roja"', /roja/i], ['familiar', /Familiar Cuota21/], ['monto', /850\.00/], ['días de mora', /4[45]\s*d/]])
    if (!re.test(fila)) f.push(`la alerta por cuota no muestra ${que} ("${fila.replace(/\s+/g, ' ').slice(0, 140)}")`);
  const est = (await exigirApi('GET', `financiero/api/financiero/estado-cuenta/${p.id}`, 'admin')).cuotas[0]?.estado;
  if (est !== 'vencida') f.push(`la cuota quedó en estado "${est}", no "vencida"`);
  // Pagarla desde la UI: sale del panel y queda "pagada".
  await seccion(page, 'financiero');
  await elegir(page, '#qPaciente', `Cuota21 ${TS}`);
  await page.fill('#qMes', '8'); await page.fill('#qAnio', '2026'); await page.fill('#qMonto', '850');
  await page.click('#formCuota button[type=submit]');
  await page.waitForTimeout(1500);
  const est2 = (await exigirApi('GET', `financiero/api/financiero/estado-cuenta/${p.id}`, 'admin')).cuotas[0]?.estado;
  if (est2 !== 'pagada') f.push(`tras el pago la cuota quedó "${est2}"`);
  return { f, ev };
};

CASO[22] = async () => {
  const f = [], ev = [];
  const resp = await exigirApi('GET', 'reportes/api/reportes/tipos', 'admin');
  const ids = (Array.isArray(resp) ? resp : resp.tipos || []).map(t => t.id || t);
  if (!ids.length) throw new Error('no hay tipos de reporte');
  const page = await pagina();
  await page.goto(`${BASE}/`);
  await page.addScriptTag({ path: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js') });
  const worker = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js'), 'utf8');
  for (const t of ids) {
    const r = await fetch(`${SVC}/reportes/api/reportes/${t}?desde=${diaGt(-90)}&hasta=${diaGt(0)}&formato=pdf`,
      { headers: { Authorization: `Bearer ${await token('admin')}` } });
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
    const info = await page.evaluate(async ({ b64, worker }) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
      const datos = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument({ data: datos }).promise;
      document.body.innerHTML = '<div id="hojas" style="background:#777;padding:12px"></div>';
      const filas = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const hoja = await pdf.getPage(i);
        const vp = hoja.getViewport({ scale: 1.4 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.cssText = 'display:block;margin:0 auto 12px;background:#fff';
        document.getElementById('hojas').appendChild(c);
        await hoja.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const tc = await hoja.getTextContent();
        filas.push(...tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, p: i })));
      }
      return { paginas: pdf.numPages, items: filas, ancho: (await pdf.getPage(1)).getViewport({ scale: 1 }).width };
    }, { b64, worker });
    await page.waitForTimeout(300);
    ev.push(await captura(page, 22, `pdf-${t}`));
    const rep = await exigirApi('GET', `reportes/api/reportes/${t}?desde=${diaGt(-90)}&hasta=${diaGt(0)}`, 'admin');
    const items = info.items.filter(i => i.s.trim());
    const p1 = items.filter(i => i.p === 1);
    // 1) Encabezado: la primera palabra de cada columna en la misma linea.
    const ys = rep.columnas.map(c => {
      const primera = c.label.split(/\s+/)[0];
      const cand = p1.filter(i => i.s.trim().startsWith(primera)).sort((a, b) => b.y - a.y);
      return cand.length ? cand[0].y : null;
    }).filter(y => y != null);
    if (ys.length && Math.max(...ys) - Math.min(...ys) > 2) f.push(`PDF ${t}: los encabezados de columna no están en una misma línea (escalonados ${Math.round(Math.max(...ys) - Math.min(...ys))} pt)`);
    // 2) Montos completos: un "Q" suelto o un monto sin su "Q" = monto partido.
    const sueltas = items.filter(i => /^Q$/.test(i.s.trim())).length;
    if (sueltas) f.push(`PDF ${t}: ${sueltas} montos partidos (la "Q" quedó en otra línea)`);
    // 3) Columnas numericas alineadas a la derecha: pocos bordes derechos distintos.
    const nMoneda = rep.columnas.filter(c => c.tipo === 'moneda').length;
    const montos = items.filter(i => /^Q\s?[\d,]+\.\d{2}$/.test(i.s.trim()));
    const bordes = new Set(montos.map(i => Math.round((i.x + i.w) / 3)));
    if (nMoneda && montos.length > nMoneda && bordes.size > nMoneda + 1) f.push(`PDF ${t}: los montos no están alineados por columna (${bordes.size} bordes derechos para ${nMoneda} columnas)`);
    const enteros = rep.columnas.filter(c => !c.tipo && rep.filas.every(fl => Number.isInteger(fl[c.key]) && c.key !== 'idPaciente' && c.key !== 'idExamen' && c.key !== 'id'));
    if (enteros.length && rep.filas.length > 1) {
      const nums = items.filter(i => /^\d+$/.test(i.s.trim()) && i.y < (ys[0] || 9999));
      const b2 = new Set(nums.map(i => Math.round((i.x + i.w) / 3)));
      if (b2.size > enteros.length + 2) f.push(`PDF ${t}: las cantidades no están alineadas por columna (${b2.size} bordes para ${enteros.length} columnas)`);
    }
    // 4) Nada encimado ni fuera del margen.
    const porLinea = {};
    for (const it of items) (porLinea[`${it.p}:${Math.round(it.y)}`] ||= []).push(it);
    let encimados = 0;
    for (const linea of Object.values(porLinea)) {
      linea.sort((a, b) => a.x - b.x);
      for (let i = 1; i < linea.length; i++) if (linea[i].x < linea[i - 1].x + linea[i - 1].w - 1) encimados++;
    }
    if (encimados) f.push(`PDF ${t}: ${encimados} textos encimados`);
    const fuera = items.filter(i => i.x + i.w > info.ancho - 10).length;
    if (fuera) f.push(`PDF ${t}: ${fuera} textos se salen del margen derecho`);
  }
  return { f, ev };
};

CASO[24] = async () => {
  const f = [], ev = [];
  const p = await nuevoPaciente('Auditoria24', 24);
  const page = await pagina();
  await entrar(page, 'admin');
  await seccion(page, 'pacientes');
  const fila = page.locator('#tbodyPacientes tr', { hasText: `Auditoria24 ${TS}` }).first();
  await fila.locator('button', { hasText: 'Editar' }).click();
  await page.waitForTimeout(800);
  await page.fill('#dlg input[name=telefono]', '55557777');
  await page.click('#dlgConfirmar');
  await page.waitForTimeout(1500);
  await seccion(page, 'auditoria');
  await page.selectOption('#audEntidad', 'paciente');
  await page.click('#formAuditoria button[type=submit]');
  await page.waitForTimeout(1500);
  const filaAud = page.locator('#tbodyAuditoria tr', { hasText: '55557777' }).first();
  if (await filaAud.count()) {
    await filaAud.locator('summary').first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  ev.push(await captura(page, 24, '1-auditoria'));
  const t = (await filaAud.innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!t) f.push('la modificación del paciente no aparece en la pantalla de auditoría');
  for (const [que, re] of [['usuario', /admin@asilo\.gt/], ['IP', /\d+\.\d+\.\d+\.\d+/], ['módulo', /pacientes/i], ['acción', /modific/i],
                           ['dato anterior', /55550000/], ['dato nuevo', /55557777/]])
    if (!re.test(t)) f.push(`la fila de auditoría no muestra ${que}`);
  if (!/anterior/i.test(t) || !/nuevo/i.test(t)) f.push('los JSON anterior / nuevo no se ven etiquetados como tales');
  const cabecera = await page.$$eval('#tabAuditoria thead th', ths => ths.map(th => th.textContent.trim()).join(' | '));
  for (const c of ['Usuario', 'IP', 'Módulo', 'Acción']) if (!cabecera.includes(c)) f.push(`la tabla de auditoría no tiene la columna ${c}`);
  void p;
  return { f, ev };
};

// ---------------------------------------------------------------- ejecucion
(async () => {
  const lista = CASOS.length ? CASOS : Object.keys(CASO).map(Number);
  browser = await chromium.launch({ headless: true });
  const resultados = [];
  for (const n of lista) {
    process.stdout.write(`Caso ${String(n).padStart(2)}  `);
    try {
      const { f, ev } = await CASO[n]();
      resultados.push({ caso: n, fase: FASE, cumple: !f.length, fallas: f, capturas: ev });
      console.log(f.length ? `NO CUMPLE (${f.length})` : 'CUMPLE');
      f.forEach(x => console.log(`    ✗ ${x}`));
    } catch (e) {
      resultados.push({ caso: n, fase: FASE, cumple: false, fallas: [`error del script: ${e.message}`], capturas: [] });
      console.log(`ERROR ${e.message}`);
    }
  }
  await browser.close();
  fs.mkdirSync(DIR, { recursive: true });
  const archivo = path.join(DIR, `resultados-${FASE}.json`);
  const previos = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : [];
  const fusion = [...previos.filter(p => !lista.includes(p.caso)), ...resultados].sort((a, b) => a.caso - b.caso);
  fs.writeFileSync(archivo, JSON.stringify(fusion, null, 2));
  process.exitCode = resultados.every(r => r.cumple) ? 0 : 1;
})();
