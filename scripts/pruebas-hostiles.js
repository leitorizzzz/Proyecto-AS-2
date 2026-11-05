/*
 * Auditoria SQA (26 oct 2026): matriz de permisos por rol (cada escritura
 * contra cada rol, segun CONTEXT_SISTEMA.md 3.3) y validaciones de entrada.
 * npm run test:hostil. Crea registros "SQA ..."; solo stack local.
 */
/*
 * Pruebas hostiles por API: matriz de permisos por rol y validaciones.
 * Imprime solo lo que NO cumple lo esperado (y un resumen).
 */
const B = s => `http://localhost:8090/svc/${s}`;
const TS = Date.now();
async function req(m, u, { body, token, rawBody } = {}) {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch {} return { status: r.status, data: d };
}
const login = async (e, p) => (await req('POST', B('auth/api/auth/login'), { body: { email: e, password: p } })).data.token;
const problemas = [];
let total = 0;
function revisar(nombre, obtenido, esperado, extra = '') {
  total++;
  const okk = Array.isArray(esperado) ? esperado.includes(obtenido) : obtenido === esperado;
  if (!okk) { problemas.push(`${nombre}: esperaba ${esperado}, obtuvo ${obtenido} ${extra}`); console.log(`  ✗ ${nombre}: esperaba ${esperado}, obtuvo ${obtenido} ${extra}`); }
}
const dpi = n => String(TS + n).slice(-13).padStart(13, '6');
const fam = n => ({ nombres: 'Fam', apellidos: `Hostil ${n}`, dpi: dpi(800 + n), parentesco: 'hija', telefono: '55550000', email: `sqa.hostil${n}@example.com`, direccion: 'Mazatenango' });

(async () => {
  const T = { admin: await login('admin@asilo.gt', 'Admin12345') };
  for (const [k, e] of Object.entries({ mg: 'medico.general@asilo.gt', esp: 'especialista@asilo.gt', coord: 'coordinador@asilo.gt', enf: 'enfermeria@asilo.gt', far: 'farmacia@asilo.gt', lab: 'laboratorio@asilo.gt' }))
    T[k] = await login(e, 'Demo1234');
  const me = async t => (await req('GET', B('auth/api/auth/me'), { token: t })).data;
  const idEnf = (await me(T.enf)).id, idEsp = (await me(T.esp)).id;
  const ROLES = Object.keys(T);

  // ---------- 1. Matriz de permisos (cuerpo vacio: si pasa el RBAC, la validacion responde 400/404/409) ----------
  console.log('\n== Matriz de permisos (escrituras) ==');
  const pac = (await req('POST', B('pacientes/api/pacientes'), { token: T.admin, body: { nombres: 'SQA', apellidos: `Hostil ${TS}`, fechaNacimiento: '1940-05-05', genero: 'F', dpi: dpi(1), familiar: fam(1) } })).data;
  const ESCR = [
    ['POST auth/register', 'POST', 'auth/api/auth/register', ['admin']],
    ['PATCH usuarios/desactivar', 'PATCH', 'auth/api/auth/usuarios/999999/desactivar', ['admin']],
    ['GET usuarios (directorio)', 'GET', 'auth/api/auth/usuarios', ['admin', 'coord', 'mg']],
    ['POST pacientes', 'POST', 'pacientes/api/pacientes', ['admin', 'enf']],
    ['PUT pacientes/:id', 'PUT', `pacientes/api/pacientes/${pac.id}`, ['admin', 'enf']],
    ['PUT pacientes/:id/familiar', 'PUT', `pacientes/api/pacientes/${pac.id}/familiar`, ['admin', 'enf']],
    ['DELETE pacientes/:id', 'DELETE', 'pacientes/api/pacientes/999999', ['admin']],
    ['PATCH pacientes/reactivar', 'PATCH', 'pacientes/api/pacientes/999999/reactivar', ['admin']],
    ['POST solicitudes', 'POST', 'pacientes/api/solicitudes', ['mg']],
    ['PATCH asignar-cita', 'PATCH', 'pacientes/api/solicitudes/999999/asignar-cita', ['admin', 'coord']],
    ['POST convertir-a-visita', 'POST', 'pacientes/api/solicitudes/999999/convertir-a-visita', ['esp']],
    ['PATCH cancelar', 'PATCH', 'pacientes/api/solicitudes/999999/cancelar', ['admin', 'mg']],
    ['PATCH visitas/:id', 'PATCH', 'pacientes/api/visitas/999999', ['esp']],
    ['POST visitas/examenes', 'POST', 'pacientes/api/visitas/999999/examenes', ['esp']],
    ['POST visitas/prescripciones', 'POST', 'pacientes/api/visitas/999999/prescripciones', ['esp']],
    ['POST visitas/completar', 'POST', 'pacientes/api/visitas/999999/completar', ['esp']],
    ['POST medicamentos', 'POST', 'farmacia/api/farmacia/medicamentos', ['admin', 'far']],
    ['PUT medicamentos/:id', 'PUT', 'farmacia/api/farmacia/medicamentos/999999', ['admin', 'far']],
    ['DELETE medicamentos/:id', 'DELETE', 'farmacia/api/farmacia/medicamentos/999999', ['admin', 'far']],
    ['PATCH medicamentos/reactivar', 'PATCH', 'farmacia/api/farmacia/medicamentos/999999/reactivar', ['admin']],
    ['POST dispensaciones', 'POST', 'farmacia/api/farmacia/dispensaciones', ['admin', 'far']],
    ['GET ordenes-pendientes', 'GET', 'laboratorio/api/laboratorio/ordenes-pendientes', ['admin', 'lab']],
    ['GET pacientes/dpi', 'GET', 'laboratorio/api/laboratorio/pacientes/dpi/0000000000000', ['admin', 'lab']],
    ['POST resultados', 'POST', 'laboratorio/api/laboratorio/resultados/examen/999999', ['admin', 'lab']],
    ['POST precios', 'POST', 'laboratorio/api/laboratorio/precios', ['admin']],
    ['PUT precios/:id', 'PUT', 'laboratorio/api/laboratorio/precios/999999', ['admin']],
    ['POST cargos', 'POST', 'financiero/api/financiero/cargos', ['admin']],
    ['POST abonos', 'POST', 'financiero/api/financiero/cargos/999999/abonos', ['admin']],
    ['POST cuotas', 'POST', 'financiero/api/financiero/cuotas', ['admin']],
    ['POST pagos-cuota', 'POST', 'financiero/api/financiero/pagos-cuota', ['admin']],
    ['POST donantes', 'POST', 'financiero/api/financiero/donantes', ['admin']],
    ['POST donaciones', 'POST', 'financiero/api/financiero/donaciones', ['admin']],
    ['POST gastos', 'POST', 'financiero/api/financiero/gastos', ['admin']],
    ['POST pagos-fundacion', 'POST', 'financiero/api/financiero/pagos-fundacion', ['admin']],
    ['GET alertas', 'GET', 'financiero/api/financiero/alertas', ['admin', 'coord']],
    ['GET alertas por cuota', 'GET', 'financiero/api/financiero/alertas/cuotas', ['admin', 'coord']],
    ['GET auditoria', 'GET', 'reportes/api/auditoria', ['admin']],
    ['POST notificaciones/:id/reintentar', 'POST', 'notificaciones/api/notificaciones/999999/reintentar', ['admin']],
    ['POST notificaciones/recuperacion', 'POST', 'notificaciones/api/notificaciones/recuperacion', []],
    ['POST notificaciones/solicitud (envía correo)', 'POST', 'notificaciones/api/notificaciones/solicitud', ['mg']],
  ];
  for (const [n, m, u, permitidos] of ESCR) for (const rol of ROLES) {
    const r = await req(m, B(u), { token: T[rol], body: m === 'GET' ? undefined : {} });
    const deberia = permitidos.includes(rol);
    revisar(`${n} [${rol}]`, deberia ? (r.status === 403 ? 403 : 'pasa') : r.status, deberia ? 'pasa' : 403, deberia ? '' : JSON.stringify(r.data).slice(0, 90));
  }
  // ?incluirInactivos solo admin
  for (const [n, u] of [['pacientes', 'pacientes/api/pacientes'], ['medicamentos', 'farmacia/api/farmacia/medicamentos'], ['donantes', 'financiero/api/financiero/donantes'], ['usuarios', 'auth/api/auth/usuarios']])
    for (const rol of ['coord', 'mg']) { const r = await req('GET', B(`${u}?incluirInactivos=true`), { token: T[rol] }); revisar(`incluirInactivos ${n} [${rol}]`, r.status, 403); }

  // ---------- 2. Validaciones ----------
  console.log('\n== Validaciones ==');
  const pacBase = n => ({ nombres: 'SQA', apellidos: `Valida ${n} ${TS}`, fechaNacimiento: '1941-01-01', genero: 'M', dpi: dpi(100 + n), familiar: fam(100 + n) });
  const V = async (nombre, m, u, token, body, esperado) => { const r = await req(m, B(u), { token, body }); revisar(nombre, r.status, esperado, JSON.stringify(r.data).slice(0, 140)); return r; };
  await V('paciente DPI con letras', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(1), dpi: '12345678901ab' }, 400);
  await V('paciente DPI de 12 dígitos', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(2), dpi: '123456789012' }, 400);
  await V('paciente nacimiento futuro', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(3), fechaNacimiento: '2099-01-01' }, 400);
  await V('paciente fecha inválida', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(4), fechaNacimiento: '2020-02-31' }, 400);
  await V('paciente nombre solo espacios', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(5), nombres: '    ' }, 400);
  await V('paciente nombre de 5000 caracteres', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(6), nombres: 'a'.repeat(5000) }, 400);
  await V('paciente género inválido', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(7), genero: 'X' }, 400);
  await V('familiar correo inválido', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(8), familiar: { ...fam(108), email: 'no-es-correo' } }, 400);
  await V('familiar DPI inválido', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(9), familiar: { ...fam(109), dpi: '123' } }, 400);
  await V('paciente DPI igual al de otro', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(10), dpi: dpi(1) }, [400, 409]);
  await V('JSON malformado', 'POST', 'pacientes/api/pacientes', T.enf, undefined, 400).catch(() => {});
  { const r = await req('POST', B('pacientes/api/pacientes'), { token: T.enf, rawBody: '{"nombres": "x",' }); revisar('JSON malformado (cuerpo roto)', r.status, 400, JSON.stringify(r.data).slice(0, 120)); }
  const tildes = await V('paciente con tildes, ñ y apóstrofo', 'POST', 'pacientes/api/pacientes', T.enf, { ...pacBase(11), nombres: 'José Ñoño', apellidos: `Pérez-O'Connor Güemes ${TS}`, padecimientos: 'Diabetes tipo 2 — <script>alert(1)</script> 😀' }, 201);
  if (tildes.status === 201) { const g = (await req('GET', B(`pacientes/api/pacientes/${tildes.data.id}`), { token: T.enf })).data; revisar('tildes/ñ/emoji se guardan igual', g.nombres === 'José Ñoño' && g.padecimientos.includes('😀') && g.padecimientos.includes('<script>'), true, JSON.stringify([g.nombres, g.padecimientos])); }

  // Solicitudes / citas
  await V('solicitud especialidad de 500', 'POST', 'pacientes/api/solicitudes', T.mg, { idPaciente: pac.id, especialidad: 'x'.repeat(500), motivo: 'm', idEnfermero: idEnf }, 400);
  await V('solicitud motivo vacío', 'POST', 'pacientes/api/solicitudes', T.mg, { idPaciente: pac.id, especialidad: 'dermatologia', motivo: '   ', idEnfermero: idEnf }, 400);
  await V('solicitud paciente inexistente', 'POST', 'pacientes/api/solicitudes', T.mg, { idPaciente: 999999, especialidad: 'dermatologia', motivo: 'm', idEnfermero: idEnf }, 404);
  await V('solicitud idPaciente texto', 'POST', 'pacientes/api/solicitudes', T.mg, { idPaciente: 'abc', especialidad: 'dermatologia', motivo: 'm', idEnfermero: idEnf }, [400, 404]);
  const sol = (await req('POST', B('pacientes/api/solicitudes'), { token: T.mg, body: { idPaciente: pac.id, especialidad: 'dermatologia', motivo: 'Lesión en piel', idEnfermero: idEnf } })).data;
  await V('cita en fecha pasada', 'PATCH', `pacientes/api/solicitudes/${sol.id}/asignar-cita`, T.coord, { fechaCita: '2020-01-01', horaCita: '10:00', idMedicoEspecialista: idEsp }, 400);
  await V('cita hora 25:00', 'PATCH', `pacientes/api/solicitudes/${sol.id}/asignar-cita`, T.coord, { fechaCita: '2026-12-10', horaCita: '25:00', idMedicoEspecialista: idEsp }, 400);
  await V('cita con médico que no es especialista', 'PATCH', `pacientes/api/solicitudes/${sol.id}/asignar-cita`, T.coord, { fechaCita: '2026-12-10', horaCita: '10:00', idMedicoEspecialista: idEnf }, 400);
  await V('cita válida', 'PATCH', `pacientes/api/solicitudes/${sol.id}/asignar-cita`, T.coord, { fechaCita: '2026-12-10', horaCita: '10:00', idMedicoEspecialista: idEsp }, 200);
  const vis = (await req('POST', B(`pacientes/api/solicitudes/${sol.id}/convertir-a-visita`), { token: T.esp })).data;
  await V('prescripción cantidad 0', 'POST', `pacientes/api/visitas/${vis.id}/prescripciones`, T.esp, { medicamento: 'X', cantidadPrescrita: 0 }, 400);
  await V('prescripción cantidad 10001', 'POST', `pacientes/api/visitas/${vis.id}/prescripciones`, T.esp, { medicamento: 'X', cantidadPrescrita: 10001 }, 400);
  await V('prescripción cantidad 2.5', 'POST', `pacientes/api/visitas/${vis.id}/prescripciones`, T.esp, { medicamento: 'X', cantidadPrescrita: 2.5 }, 400);
  await V('prescripción sin nombre', 'POST', `pacientes/api/visitas/${vis.id}/prescripciones`, T.esp, { cantidadPrescrita: 2 }, 400);
  await V('prescripción idMedicamento inexistente', 'POST', `pacientes/api/visitas/${vis.id}/prescripciones`, T.esp, { medicamento: 'X', idMedicamento: 999999, cantidadPrescrita: 2 }, [400, 404, 409]);
  await V('examen tipo vacío', 'POST', `pacientes/api/visitas/${vis.id}/examenes`, T.esp, { tipo: '  ' }, 400);
  await V('diagnóstico de 10000 caracteres', 'PATCH', `pacientes/api/visitas/${vis.id}`, T.esp, { diagnostico: 'd'.repeat(10000) }, [200, 400]);

  // Farmacia
  await V('medicamento stock negativo', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA neg ${TS}`, presentacion: 'tab', stock: -5, precioUnitario: 1 }, 400);
  await V('medicamento precio 0', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA cero ${TS}`, presentacion: 'tab', stock: 5, precioUnitario: 0 }, 400);
  await V('medicamento precio negativo', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA negp ${TS}`, presentacion: 'tab', stock: 5, precioUnitario: -1 }, 400);
  await V('medicamento stock decimal', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA dec ${TS}`, presentacion: 'tab', stock: 2.5, precioUnitario: 1 }, 400);
  await V('medicamento sin nombre', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { presentacion: 'tab', stock: 5, precioUnitario: 1 }, 400);
  const medOk = await V('medicamento válido', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA Ácido fólico ${TS}`, presentacion: 'tableta 5 mg', stock: 10, precioUnitario: 0.75 }, 201);
  await V('medicamento nombre duplicado', 'POST', 'farmacia/api/farmacia/medicamentos', T.far, { nombre: `SQA Ácido fólico ${TS}`, presentacion: 'tableta 5 mg', stock: 1, precioUnitario: 0.75 }, [400, 409]);
  await V('editar medicamento a stock negativo', 'PUT', `farmacia/api/farmacia/medicamentos/${medOk.data.id}`, T.far, { nombre: medOk.data.nombre, presentacion: 'x', stock: -1, precioUnitario: 1 }, 400);
  await V('dispensar cantidad 0', 'POST', 'farmacia/api/farmacia/dispensaciones', T.far, { idPrescripcion: 1, idPaciente: pac.id, cantidad: 0 }, 400);
  await V('dispensar cantidad negativa', 'POST', 'farmacia/api/farmacia/dispensaciones', T.far, { idPrescripcion: 1, idPaciente: pac.id, cantidad: -3 }, 400);

  // Laboratorio
  await V('precio examen negativo', 'POST', 'laboratorio/api/laboratorio/precios', T.admin, { tipo: `SQA neg ${TS}`, precioBase: -10 }, 400);
  await V('precio examen 0', 'POST', 'laboratorio/api/laboratorio/precios', T.admin, { tipo: `SQA cero ${TS}`, precioBase: 0 }, 400);
  await V('precio examen tipo vacío', 'POST', 'laboratorio/api/laboratorio/precios', T.admin, { tipo: '', precioBase: 10 }, 400);
  await V('precio examen duplicado', 'POST', 'laboratorio/api/laboratorio/precios', T.admin, { tipo: 'Uroanalisis', precioBase: 10 }, [400, 409]);
  await V('resultado tipo inválido', 'POST', 'laboratorio/api/laboratorio/resultados/examen/1', T.lab, { tipoResultado: 'magia', valorTexto: 'x' }, 400);
  await V('resultado numérico con texto', 'POST', 'laboratorio/api/laboratorio/resultados/examen/999999', T.lab, { tipoResultado: 'numerico', valorNumerico: 'alto' }, [400, 404]);
  await V('resultado examen inexistente', 'POST', 'laboratorio/api/laboratorio/resultados/examen/999999', T.lab, { tipoResultado: 'texto', valorTexto: 'x' }, 404);
  await V('resultado archivo con URL javascript:', 'POST', 'laboratorio/api/laboratorio/resultados/examen/999999', T.lab, { tipoResultado: 'archivo', archivoAdjunto: 'javascript:alert(1)' }, [400, 404]);

  // Financiero
  await V('cargo monto 0', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: 'x', monto: 0 }, 400);
  await V('cargo monto negativo', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: 'x', monto: -50 }, 400);
  await V('cargo monto texto', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: 'x', monto: 'cien' }, 400);
  await V('cargo monto con 3 decimales', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: 'x', monto: 10.555 }, [400, 201]);
  await V('cargo monto enorme', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: 'x', monto: 1e15 }, 400);
  await V('cargo sin concepto', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: pac.id, concepto: '  ', monto: 10 }, 400);
  await V('cargo paciente inexistente', 'POST', 'financiero/api/financiero/cargos', T.admin, { idPaciente: 999999, concepto: 'x', monto: 10 }, [404, 409]);
  await V('cuota mes 13', 'POST', 'financiero/api/financiero/cuotas', T.admin, { idPaciente: pac.id, mes: 13, anio: 2026, monto: 10 }, 400);
  await V('cuota mes 0', 'POST', 'financiero/api/financiero/cuotas', T.admin, { idPaciente: pac.id, mes: 0, anio: 2026, monto: 10 }, 400);
  await V('cuota año 1900', 'POST', 'financiero/api/financiero/cuotas', T.admin, { idPaciente: pac.id, mes: 1, anio: 1900, monto: 10 }, 400);
  await V('cuota monto negativo', 'POST', 'financiero/api/financiero/cuotas', T.admin, { idPaciente: pac.id, mes: 1, anio: 2026, monto: -10 }, 400);
  await V('pago cuota monto negativo', 'POST', 'financiero/api/financiero/pagos-cuota', T.admin, { idPaciente: pac.id, mes: 2, anio: 2026, monto: -10 }, 400);
  await V('cuota fechaVencimiento inválida', 'POST', 'financiero/api/financiero/cuotas', T.admin, { idPaciente: pac.id, mes: 3, anio: 2026, monto: 10, fechaVencimiento: '2026-02-30' }, 400);
  await V('donante sin nombre', 'POST', 'financiero/api/financiero/donantes', T.admin, { nombre: ' ' }, 400);
  await V('donante correo inválido', 'POST', 'financiero/api/financiero/donantes', T.admin, { nombre: 'SQA donante', email: 'malo' }, 400);
  await V('donación monto negativo', 'POST', 'financiero/api/financiero/donaciones', T.admin, { idDonante: 1, monto: -100, tipo: 'dinero' }, 400);
  await V('donación tipo inválido', 'POST', 'financiero/api/financiero/donaciones', T.admin, { idDonante: 1, monto: 100, tipo: 'bitcoin' }, 400);
  await V('donación donante inexistente', 'POST', 'financiero/api/financiero/donaciones', T.admin, { idDonante: 999999, monto: 100, tipo: 'dinero' }, [404, 409]);
  await V('gasto monto 0', 'POST', 'financiero/api/financiero/gastos', T.admin, { concepto: 'x', monto: 0, categoria: 'otros' }, 400);
  await V('gasto categoría inválida', 'POST', 'financiero/api/financiero/gastos', T.admin, { concepto: 'x', monto: 5, categoria: 'fiesta' }, 400);
  await V('pago fundación negativo', 'POST', 'financiero/api/financiero/pagos-fundacion', T.admin, { concepto: 'x', monto: -1 }, 400);
  await V('estado de cuenta paciente texto', 'GET', 'financiero/api/financiero/estado-cuenta/abc', T.admin, undefined, [400, 404]);
  await V('estado de cuenta paciente inexistente', 'GET', 'financiero/api/financiero/estado-cuenta/999999', T.admin, undefined, 404);

  // Usuarios
  await V('usuario correo inválido', 'POST', 'auth/api/auth/register', T.admin, { nombre: 'X', email: 'sin-arroba', password: 'Abcdef12', rol: 'farmacia' }, 400);
  await V('usuario rol inválido', 'POST', 'auth/api/auth/register', T.admin, { nombre: 'X', email: `sqa.r${TS}@asilo.gt`, password: 'Abcdef12', rol: 'superadmin' }, 400);
  await V('usuario rol sistema (no asignable)', 'POST', 'auth/api/auth/register', T.admin, { nombre: 'X', email: `sqa.s${TS}@asilo.gt`, password: 'Abcdef12', rol: 'sistema' }, 400);
  await V('usuario nombre vacío', 'POST', 'auth/api/auth/register', T.admin, { nombre: ' ', email: `sqa.n${TS}@asilo.gt`, password: 'Abcdef12', rol: 'farmacia' }, 400);
  await V('usuario correo duplicado (mayúsculas)', 'POST', 'auth/api/auth/register', T.admin, { nombre: 'X', email: 'ADMIN@asilo.gt', password: 'Abcdef12', rol: 'farmacia' }, [400, 409]);
  await V('login correo en mayúsculas', 'POST', 'auth/api/auth/login', undefined, { email: 'ADMIN@ASILO.GT', password: 'Admin12345' }, 200);
  await V('login sin cuerpo', 'POST', 'auth/api/auth/login', undefined, {}, 400);

  // Reportes y auditoria
  await V('reporte desde > hasta', 'GET', 'reportes/api/reportes/entradas?desde=2026-10-20&hasta=2026-10-01', T.admin, undefined, 400);
  await V('reporte tipo inexistente', 'GET', 'reportes/api/reportes/inventado', T.admin, undefined, [400, 404]);
  await V('reporte formato inválido', 'GET', 'reportes/api/reportes/entradas?formato=docx', T.admin, undefined, 400);
  await V('auditoría límite enorme', 'GET', 'reportes/api/auditoria?limite=100000000', T.admin, undefined, [200, 400]);
  await V('auditoría fecha inválida', 'GET', 'reportes/api/auditoria?desde=ayer', T.admin, undefined, 400);

  console.log(`\n${total} comprobaciones, ${problemas.length} problemas`);
  process.exitCode = problemas.length ? 1 : 0;
})();
