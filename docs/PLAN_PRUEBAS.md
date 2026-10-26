# Plan de pruebas automatizadas

> Sistema de Gestion Integral — Asilo Cabeza de Algodon
> Elaborado por el equipo de desarrollo para la revision del SQA.

## Alcance y herramientas

Pruebas unitarias con **Jest 29** y pruebas de autorizacion con
**Supertest 7**. Cubren la capa de **logica de negocio** (donde viven las
reglas RN-xx) y el **pipe de middlewares** (autenticacion + autorizacion
por rol) de los servicios. Los repositorios se simulan con mocks para
aislar las pruebas de la base de datos; en notificaciones tambien se
simula `fetch` para no llamar a Brevo.

Las pruebas se dividen en dos capas separadas:

**(1) Unitarias + RBAC**: NO requieren el stack Docker. Mocks de repositorios
y app Express sintetica. `npm install` en la raiz basta: `express`,
`jsonwebtoken`, `bcryptjs`, `exceljs` y `pdfkit` estan como devDependencies de la raiz para que
las pruebas corran en un clon limpio sin instalar cada servicio.
```bash
./scripts/run-all-tests.sh         # Linux / Git Bash
./scripts/run-all-tests.ps1        # PowerShell
npm run test:todo
```
Ultima ejecucion (26 oct 2026, auditoria final, sobre un stack recien creado con
`docker compose down -v` + `scripts/bootstrap.ps1`): **382 casos en 44 archivos, 382 OK, 0 fallas**.

**(2) Integracion end-to-end**: requieren el stack docker-compose
arriba. Recorren el flujo completo de un paciente, con usuarios reales
y JWT, contra las APIs HTTP. Un paso por linea con [ OK ] / [FALLA].
```bash
npm run test:e2e                         # localhost
BASE_HOST=100.96.172.77 npm run test:e2e  # servidor Debian
```
Ultima ejecucion (26 oct 2026, stack local recien creado): **62 pasos, 62 OK**. El
paso 58 verifica ademas que los abonos a cargos aparecen en "Cobros por rango"
y "Entradas de dinero" por su monto exacto.
El paso de RF-42 lee el enlace de recuperacion de la tabla `notificaciones`
con `docker exec` (la API no lo expone a proposito); contra otro host solo
verifica la parte de API.

**(3) Carga** (caso 25): `npm run test:carga` (`USUARIOS=20..50`, `VUELTAS`,
`LIMITE_MS`). Cada usuario virtual hace login, lista pacientes, crea y
lista solicitudes; reporta p50/p95/max por operacion y falla si una
peticion supera 3 s. Ultima ejecucion (26 oct, stack recien creado): 50 usuarios x 3 vueltas,
600 peticiones, max 911 ms, p95 626 ms, 0 errores. Antes del arreglo (bcrypt en
el hilo principal) el login llegaba a 7,1 s con 30 usuarios.

**(4) Auditoria SQA** (26 oct 2026, solo stack local: crean registros "SQA ..."
y usan `docker exec`):

| Comando | Que hace | Ultima ejecucion |
|---|---|---|
| `npm run test:sqa` | Ejecuta 23 de los 25 casos del plan contra el stack, uno por uno, y guarda la evidencia en [verificacion-plan-sqa.json](verificacion-plan-sqa.json) | 23/23 OK (3 con diferencia de nombre) |
| `npm run test:caso11` + [override-brevo-caido.yml](../scripts/override-brevo-caido.yml) | Caso 11 con Brevo inalcanzable (127.0.0.1:9; nunca el Brevo real) | solicitud 201; fallida -> fallida -> fallida_definitiva |
| `npm run test:carga` (`USUARIOS=50`) | Caso 25 | max 911 ms |
| `npm run test:hostil` | Matriz de permisos (cada escritura x 7 roles, segun `CONTEXT_SISTEMA.md` §3.3) y ~80 validaciones de entrada (DPI, correos, montos, fechas, textos largos, tildes, JSON roto) | 363 comprobaciones, 0 problemas |
| `npm run test:integridad` | 18 consultas de consistencia en la BD (cargo = desglose, pagado = abonos, 20 % en todo, un cargo por visita, RN-02, stock >= 0...) | 18/18 limpias |

Ademas se recorrio el frontend en Chrome con los 7 roles (todas las secciones:
sin errores de consola, sin pantallas en blanco, sin codigos internos) y a 390 px
de ancho (sin desborde horizontal).

**Regla de las pruebas de integracion:** el e2e solo crea, modifica,
desactiva o reactiva registros que creo el mismo (pacientes "E2E ...",
medicamento "E2E medicamento <ts>", precio "E2E examen (no usar)",
donantes "E2E donante <ts>", cuentas "e2e.*"). Los datos existentes,
de demo o reales, solo se leen. Hasta el 20 oct el paso E2E-09/E2E-11
dispensaba el Losartan del inventario (bajaba su stock real) y E2E-29
hacia PUT sobre el primer precio del catalogo; ambos se corrigieron.

## Plan oficial del SQA (25 casos)

Resultado por caso (OK / OK con diferencia / FALLA) con su evidencia en
[RESULTADOS_PLAN_SQA.csv](RESULTADOS_PLAN_SQA.csv); los nombres del plan
(internos, log_notificaciones, estados en mayusculas) se traducen a las
tablas reales en [EQUIVALENCIAS.md](EQUIVALENCIAS.md). Pruebas que cubren
cada caso:

| Caso | Prueba unitaria | Paso e2e (texto del smoke) |
|---|---|---|
| 1 Login + JWT | AuthService.test.js | login admin |
| 2 RBAC 403 | rbac.test.js de cada servicio | RBAC backend: farmacia crea paciente... -> 403 |
| 3 401 sin BD | rbac.test.js (repositorios simulados) | — |
| 4 JWT en varios servicios | — | todo el smoke usa el mismo token en los 7 servicios |
| 5 Interno + familiar + ficha 1:1 | FamiliarFicha.test.js | caso 5 (2 pasos) |
| 6 Egreso con fecha y motivo | Egreso.test.js, PacienteActivo.test.js | pacientes: DELETE /:id desactiva un paciente propio |
| 7 Solicitud con enfermero | SolicitudService.test.js | caso 7 |
| 8 No-MG no crea | rbacPacientes.test.js | caso 7 (enfermero y especialista 403) |
| 9 RN-02 con la activa | SolicitudService.test.js | RN-02: segunda solicitud activa... -> 409 |
| 10 Brevo: enviada + ID | NotificacionesService.test.js | notificaciones: existe una para este paciente |
| 11 Caida de Brevo | NotificacionesService.test.js | — (`npm run test:caso11` con el override; 26 oct) |
| 12 Aviso interno al medico | SolicitudService.test.js | caso 12 |
| 13 Visita vinculada a la ficha | VisitaMedicaService.test.js | caso 13 |
| 14 Visita INCOMPLETA | VisitaIncompleta.test.js | caso 14 |
| 15 Costo registrado al ordenar | CostoExamen.test.js, LaboratorioService.test.js | caso 15 |
| 16 Resultado visible | — | caso 16 |
| 17 RN-06 | FarmaciaService.test.js | farmacia: segundo intento de dispensar -> 409 |
| 18 Despacho parcial | DespachoParcial.test.js | caso 18 (3 pasos) |
| 19 Cargo atomico | CargoVisita.test.js | caso 19 (2 pasos), caso 18/19 |
| 20 Saldos y familiar completo | AbonosCargo.test.js, TitularCuenta.test.js | caso 20 |
| 21 Alertas naranja/roja | AlertasCobro.test.js | caso 21 |
| 22 PDF/Excel con formulas | ReportesExport.test.js | caso 22, reportes en PDF y Excel |
| 23 SQL injection | ReportesExport.test.js | caso 23 |
| 24 Auditoria completa (IP real) | Auditoria.test.js, IpCliente.test.js | auditoria (2 pasos), caso 24 |
| 25 Rendimiento < 3 s | HashPool.test.js | `npm run test:carga` |
| RF-42 Recuperacion de contrasena | Recuperacion.test.js, rbac.test.js (auth), NotificacionesService.test.js | RF-42 (recuperar) |
| RF-42 Regla de contrasena (8+, letra y numero) | PasswordRegla.test.js | RF-42 (contrasena de 8+) |
| Limite de intentos (5 por IP + usuario en 15 min) | LimitadorIntentos.test.js | limite |

Rango de reportes (bloque 3): ReportesRango.test.js y el paso "reportes:
rango hoy-a-hoy...". Los casos nuevos de esta ronda no tienen ID propio
en la tabla siguiente: se identifican por archivo (ver "Mapa a archivos").

## Tabla de casos unitarios

Cada ID corresponde 1 a 1 con una prueba en el codigo
(`<servicio>/__tests__/<archivo>.test.js`); el nombre del `test(...)` es
el texto de la columna *Pasos → Resultado esperado*. El SQA puede
verificar el mapeo abriendo cada archivo (ver "Mapa a archivos").

| ID | Modulo | Regla / Requisito | Precondicion | Pasos | Resultado esperado | Resultado real |
|---|---|---|---|---|---|---|
| **PS-01** | pacientes | Crear solicitud | Paciente valido, especialidad y motivo | SolicitudService.crear({idPaciente,especialidad,motivo}) | 201 con estado `pendiente_asignacion` | OK |
| **PS-02** | pacientes | **RN-02** duplicado | Ya existe una solicitud activa para el mismo paciente y especialidad | Crear otra con misma especialidad | 409 "Ya existe una solicitud activa..." | OK |
| **PS-03** | pacientes | Validacion | Datos invalidos | Crear sin motivo | 400 "motivo es requerido" | OK |
| **PS-04** | pacientes | 404 | No existe la solicitud | obtener(id) con id inexistente | 404 "Solicitud no encontrada" | OK |
| **PS-05** | pacientes | Transicion de estado | Solicitud en `cita_asignada` | asignarCita(id, datos) | 409 "Solo se puede asignar cita a solicitudes en 'pendiente_asignacion'" | OK |
| **PS-06** | pacientes | **Inmutabilidad** | Solicitud `completada` | cancelar(id) | 409 "No se puede cancelar una solicitud ya completada" | OK |
| **PS-07** | pacientes | **Inmutabilidad** | Solicitud `cancelada` | cancelar(id) | 409 "La solicitud ya esta cancelada" | OK |
| **PS-08** | pacientes | Cancelacion valida | Solicitud `pendiente_asignacion` | cancelar(id) | OK, estado = `cancelada` | OK |
| **PA-01** | pacientes | Validacion DPI | — | registrar con DPI de 12 digitos | Error "13 digitos" | OK |
| **PA-02** | pacientes | DPI unico | Ya existe paciente con ese DPI | registrar | Error "Ya existe un paciente" | OK |
| **PA-03** | pacientes | DPI unico al editar | El DPI pertenece a otro paciente | actualizar(1, datos) | Error "otro paciente"; no se escribe | OK |
| **PA-04** | pacientes | Editar paciente | El DPI es el suyo | actualizar con telefono nuevo | Se guarda el telefono | OK |
| **PA-05** | pacientes | Borrado logico | Paciente ya desactivado | desactivar(1) | 409; no se escribe | OK |
| **PA-06** | pacientes | 404 | Paciente inexistente | desactivar(99) | Error "Paciente no encontrado" | OK |
| **PV-01** | pacientes | **Paciente activo** | Paciente desactivado | asegurarPacienteActivo | 409 con el nombre y la accion | OK |
| **PV-02** | pacientes | Paciente activo | Paciente inexistente | asegurarPacienteActivo | 404 | OK |
| **PV-03** | pacientes | Paciente activo | Paciente activo | asegurarPacienteActivo | Devuelve el paciente | OK |
| **PV-04** | pacientes | **Paciente activo** | Paciente desactivado | SolicitudService.crear | 409; no se guarda | OK |
| **PV-05** | pacientes | **Paciente activo** | Solicitud de paciente desactivado | asignarCita | 409; no se escribe | OK |
| **PV-06** | pacientes | **Paciente activo** | Solicitud con cita de paciente desactivado | convertirDesdeSolicitud | 409; no se crea la visita | OK |
| **PV-07** | pacientes | **Paciente activo** | Visita de paciente desactivado | agregarExamen | 409 | OK |
| **PV-08** | pacientes | **Paciente activo** | Visita de paciente desactivado | agregarPrescripcion | 409 | OK |
| **PV-09** | pacientes | Borrado logico | Paciente activo | desactivar | cambiarActivo(id, false) | OK |
| **PV-10** | pacientes | Borrado logico | Paciente activo | reactivar | 409 | OK |
| **PV-11** | pacientes | Borrado logico | Paciente desactivado | reactivar | cambiarActivo(id, true) | OK |
| **PV-12** | pacientes | Listado | — | listar() y listar({incluirInactivos:true}) | Pasa el filtro al repo (por defecto false) | OK |
| **PV-13** | pacientes | DPI unico | DPI de un paciente desactivado | registrar | Mensaje que sugiere reactivarlo | OK |
| **VM-01** | pacientes | Completar visita exige diagnostico | Visita en `en_atencion` con diagnostico vacio y observaciones ok | completar(id) | 400 "falta diagnostico" | OK |
| **VM-02** | pacientes | Completar visita exige observaciones | Visita con diagnostico ok y observaciones vacias | completar(id) | 400 "faltan observaciones" | OK |
| **VM-03** | pacientes | Completar OK | Visita con diagnostico y observaciones | completar(id) | Estado = `completada`, solicitud enlazada tambien se marca completada | OK |
| **VM-04** | pacientes | **Inmutabilidad** | Visita `completada` | actualizarClinico(id, datos) | 409 "Solo se puede editar una visita en estado 'en_atencion'" | OK |
| **VM-05** | pacientes | Prescripcion con idMedicamento | Visita activa | agregarPrescripcion({medicamento, idMedicamento}) | Guarda la prescripcion con idMedicamento asociado | OK |
| **FS-01** | farmacia | **RN-09** calculo | — | calcularCosto(10, 2) | 16 (20 * 0.80) | OK |
| **FS-02** | farmacia | **RN-06** sin prescripcion | Request sin idPrescripcion | dispensar({cantidad:1}) | 400 que menciona RN-06 | OK |
| **FS-03** | farmacia | **RN-06** inexistente | idPrescripcion 99 no existe | dispensar({idPrescripcion:99, cantidad:1}) | 404 | OK |
| **FS-04** | farmacia | **RN-06** no re-dispensar | Prescripcion `dispensada` | dispensar(idPrescripcion ya usado) | 409 "ya fue dispensada" | OK |
| **FS-05** | farmacia | **RN-06** sin medicamento | Prescripcion sin idMedicamento asociado | dispensar(idPrescripcion) | 400 "no tiene medicamento del inventario asociado" | OK |
| **FS-06** | farmacia | **RN-06** paciente | Prescripcion de otro paciente | dispensar con idPaciente que no coincide | 400 "pertenece al paciente X, no al Y" | OK |
| **FS-07** | farmacia | Stock insuficiente | Medicamento con stock 1 | dispensar cantidad 10 | 409 "Stock insuficiente" | OK |
| **FS-08** | farmacia | **RN-06 + RN-09** OK | Prescripcion valida, stock ok | dispensar(cantidad:5, precio 1.20) | 201 con costoTotal 4.80 (5*1.20*0.80), stock decrementado, prescripcion marcada `dispensada` | OK |
| **LS-01** | laboratorio | **RN-09** laboratorio | Precio base 85, descuento 20% | calcularCostoConDescuento(idExamen) | {precioBase:85, descuentoFundacion:17, total:68} | OK |
| **LS-02** | laboratorio | Precio no configurado | Orden con tipo sin precio | calcularCostoConDescuento | 404 "No hay precio configurado" | OK |
| **LS-03** | laboratorio | Validacion tipo texto | tipoResultado='texto' sin valorTexto | registrarResultado | 400 "valorTexto es requerido" | OK |
| **LS-04** | laboratorio | Validacion tipo numerico | tipoResultado='numerico' sin valor | registrarResultado | 400 "valorNumerico es requerido" | OK |
| **LS-05** | laboratorio | Tipo invalido | tipoResultado='xyz' | registrarResultado | 400 con lista de tipos validos | OK |
| **LS-06** | laboratorio | No duplicar resultado | Ya hay resultado para el examen | registrarResultado | 409 "Ya existe un resultado para el examen" | OK |
| **LS-07** | laboratorio | Flujo exitoso | Orden sin resultado | registrarResultado texto | Resultado creado, orden pasa a `disponible` | OK |
| **LP-01** | laboratorio | **RN-09** en catalogo | Precio base 85 | listarPrecios | precioConDescuento 68, porcentajeDescuento 0.2 | OK |
| **LP-02** | laboratorio | Validacion precio | — | crearPrecio sin tipo | 400 | OK |
| **LP-03** | laboratorio | Validacion precio | — | crearPrecio con precio 0 | 400 | OK |
| **LP-04** | laboratorio | Tipo unico | Ya existe "EKG" | crearPrecio "EKG" | 409 | OK |
| **LP-05** | laboratorio | Alta de precio | — | crearPrecio(" Perfil tiroideo ", "110.456") | Se guarda recortado y 110.46; con descuento 88.37 | OK |
| **LP-06** | laboratorio | 404 | id inexistente | actualizarPrecio(5) | 404 | OK |
| **LP-07** | laboratorio | Tipo unico al editar | Otro precio ya usa "EKG" | actualizarPrecio renombrando a "EKG" | 409 | OK |
| **LP-08** | laboratorio | Editar precio | Precio existente | actualizarPrecio solo con precioBase 75 | Conserva el tipo; con descuento 60 | OK |
| **FI-01** | financiero | Alerta nivel bajo | Saldo 450, umbral 1000 | estadoCuenta | alerta.nivel = 'bajo' | OK |
| **FI-02** | financiero | Alerta nivel alto | Saldo 1100, umbral 1000 | estadoCuenta | alerta.nivel = 'alto' + mensaje con umbral | OK |
| **FI-03** | financiero | Sin alerta | Saldo 0 | estadoCuenta | alerta = null | OK |
| **FI-04** | financiero | Validacion cargo | monto 0 o concepto vacio | generarCargo | 400 | OK |
| **FI-05** | financiero | Cargo OK | Datos validos | generarCargo | Cargo pendiente guardado | OK |
| **FI-06** | financiero | Cuota nueva | No existe cuota del periodo | registrarPagoCuota | Crea cuota + la paga | OK |
| **FI-07** | financiero | Cuota ya pagada | Cuota existente en estado 'pagada' | registrarPagoCuota | 409 "La cuota X/Y ya esta pagada" | OK |
| **FI-08** | financiero | Mes invalido | mes=13 | registrarPagoCuota | 400 "mes debe estar entre 1 y 12" | OK |
| **FI-09** | financiero | Validacion gasto | — | registrarGasto sin concepto | 400 | OK |
| **FI-10** | financiero | Categoria de gasto | — | registrarGasto categoria 'lujos' | 400 | OK |
| **FI-11** | financiero | Gasto OK | Sin categoria | registrarGasto({concepto, monto:'350.5'}) | Se guarda con categoria 'otros' y monto 350.5 | OK |
| **FI-12** | financiero | Validacion pago fundacion | — | registrarPagoFundacion monto 0 | 400 | OK |
| **FI-13** | financiero | Pago fundacion OK | Datos validos | registrarPagoFundacion | Se guarda | OK |
| **AU-01** | auth | Registro | — | registrar con rol 'jefe' | Error "Rol invalido"; no se guarda | OK |
| **AU-02** | auth | Email unico | Email ya usado | registrar | Error "Ya existe" | OK |
| **AU-03** | auth | Registro OK | — | registrar | Hash bcrypt valido; la respuesta no trae passwordHash | OK |
| **AU-04** | auth | Login | Password incorrecta | login | "Credenciales invalidas" | OK |
| **AU-05** | auth | Login OK | Usuario valido | login | JWT verificable con {sub, email, rol} | OK |
| **AU-06** | auth | Directorio | — | listarUsuarios rol 'jefe' | 400 | OK |
| **AU-07** | auth | Directorio | Un especialista | listarUsuarios "medico_especialista, especialista" | Filtra por ambos roles; sin passwordHash | OK |
| **CU-01** | auth | **Cuenta desactivada** | Password correcta | login | 403 "Cuenta desactivada" | OK |
| **CU-02** | auth | Cuenta desactivada | Password incorrecta | login | 401 generico (no revela el estado) | OK |
| **CU-03** | auth | Autodesactivacion | El admin es el solicitante | desactivarUsuario(1, 1) | 409; no se escribe | OK |
| **CU-04** | auth | Desactivar cuenta | Cuenta activa de otro usuario | desactivarUsuario | activo false, sin passwordHash | OK |
| **CU-05** | auth | Desactivar cuenta | Ya desactivada | desactivarUsuario | 409 | OK |
| **CU-06** | auth | Reactivar cuenta | Activa / inexistente | reactivarUsuario | 409 / 404 | OK |
| **CU-07** | auth | Directorio | — | listarUsuarios({incluirInactivos:true}) | Pasa el filtro al repo | OK |
| **FA-01** | farmacia | **Paciente activo** | Prescripcion de paciente desactivado | dispensarMedicamento | 409; no toca stock ni dispensaciones | OK |
| **FA-02** | farmacia | Borrado logico | Medicamento desactivado | dispensarMedicamento | 409 | OK |
| **FA-03** | farmacia | Borrado logico | Medicamento activo | desactivarMedicamento | cambiarActivo(id, false) | OK |
| **FA-04** | farmacia | Borrado logico | Ya desactivado / activo | desactivar / reactivar | 409 / 409 | OK |
| **FA-05** | farmacia | Listado | — | listarMedicamentos() | incluirInactivos false por defecto | OK |
| **DA-01** | financiero | Borrado logico | Donante desactivado | registrarDonacion | 409; no se guarda | OK |
| **DA-02** | financiero | Borrado logico | Donante activo | desactivarDonante | cambiarActivoDonante(id, false) | OK |
| **DA-03** | financiero | Borrado logico | Activo / inexistente | reactivar / desactivar | 409 / 404 | OK |
| **DA-04** | financiero | Listado | — | listarDonantes() | incluirInactivos false por defecto | OK |
| **AW-01** | auditoria | Registro | — | AuditoriaService.registrar(jwt, 'desactivar', 'paciente', 12, ...) | Guarda email e id del JWT, accion, entidad, id, detalle | OK |
| **AW-02** | auditoria | Tolerancia a fallos | El repo lanza error | registrar | No lanza; devuelve null y avisa en el log | OK |
| **AW-03** | auditoria | Validacion | Accion o entidad desconocida | registrar | No escribe | OK |
| **AW-04** | auditoria | Validacion | Detalle de 500 caracteres | registrar | Se recorta a 300 | OK |
| **AW-05** | auditoria | Uso en controlador | Desactivar OK | PacienteController.desactivar | registrar(jwt, 'desactivar', 'paciente', 12, 'Rosa Gomez') | OK |
| **AW-06** | auditoria | Uso en controlador | La operacion falla (409) | PacienteController.desactivar | Responde 409 y no registra | OK |
| **AW-07** | pacientes | Ver inactivos | Rol no admin | PacienteController.listar ?incluirInactivos=true | 403 | OK |
| **AR-01** | auditoria | Consulta | Sin filtros | AuditoriaService(lector).listar | limite 200, sin fechas | OK |
| **AR-02** | auditoria | Fechas | desde/hasta YYYY-MM-DD | listar | hasta incluye el dia (exclusivo al dia siguiente) | OK |
| **AR-03** | auditoria | Fechas | Instantes ISO | listar | Se respetan tal cual | OK |
| **AR-04** | auditoria | Validacion | Fecha invalida; desde >= hasta | listar | 400 / 400 | OK |
| **AR-05** | auditoria | Validacion | Entidad desconocida; idEntidad no entero | listar | 400 / 400 | OK |
| **AR-06** | auditoria | Limite | limite 5000 | listar | Se recorta a 1000 | OK |
| **AR-07** | auditoria | Arranque | La tabla no existe (error 208) | listar | Lista vacia | OK |
| **AR-08** | auditoria | **RBAC** | Sin token | GET /api/auditoria | 401 | OK |
| **AR-09** | auditoria | **RBAC** | Token coordinador_fundacion | GET /api/auditoria | 403 | OK |
| **AR-10** | auditoria | **RBAC** | Token admin | GET /api/auditoria | 200 | OK |
| **NO-01** | notificaciones | Validacion | Sin familiarEmail | enviarCorreoSolicitud | 400 | OK |
| **NO-02** | notificaciones | Modo simulacion | MODO_SIMULACION=true | enviarCorreoSolicitud | `enviada` sin llamar a fetch | OK |
| **NO-03** | notificaciones | Envio real | Brevo responde 2xx | enviarCorreoSolicitud | POST con header api-key y destinatario correcto; `enviada` | OK |
| **NO-04** | notificaciones | Reintento | Brevo responde 401, quedan intentos | enviarCorreoSolicitud | `fallida`, proximo intento en 30 s | OK |
| **NO-05** | notificaciones | Agotar intentos | Intento 3 de 3 falla | intentarEnvio | `fallida_definitiva` | OK |
| **NO-06** | notificaciones | Espera creciente | base 30, tope 300 | _calcularProximoIntento(1..5) | 30, 60, 120, 240, 300 s | OK |
| **NO-07** | notificaciones | Reintento manual | Notificacion ya `enviada` | reintentarManual | 409 | OK |
| **RB-01** | pacientes | **RBAC** sin token | Sin header Authorization | POST /api/solicitudes | 401 "Token no proporcionado" | OK |
| **RB-02** | pacientes | **RBAC** token invalido | Header con token basura | POST /api/solicitudes | 401 "Token invalido o expirado" | OK |
| **RB-03** | pacientes | **RBAC** rol equivocado | Token con rol admin | POST /api/solicitudes (requiere medico_general) | 403 | OK |
| **RB-04** | pacientes | **RBAC** rol correcto | Token con rol medico_general | POST /api/solicitudes | 201 | OK |
| **RB-05** | pacientes | **RBAC** asignar | Token medico_general | PATCH /:id/asignar-cita | 403 (solo coordinador o admin) | OK |
| **RB-06** | pacientes | **RBAC** asignar OK | Token coordinador_fundacion | PATCH /:id/asignar-cita | 200 | OK |
| **RB-07** | pacientes | **RBAC** convertir rol invalido | Token medico_general | POST /:id/convertir-a-visita | 403 | OK |
| **RB-08** | pacientes | **RBAC** convertir rol valido | Token medico_especialista | POST /:id/convertir-a-visita | 201 | OK |
| **RB-09** | pacientes | **RBAC** GET autenticado | Token enfermero | GET /api/solicitudes | 200 (lectura permitida a cualquier autenticado) | OK |
| **RBP-01** | pacientes | **RBAC** alta | Token farmacia | POST /api/pacientes | 403 | OK |
| **RBP-02** | pacientes | **RBAC** alta | Token enfermero | POST /api/pacientes | 201 | OK |
| **RBP-03** | pacientes | **RBAC** edicion | Token medico_general | PUT /api/pacientes/1 | 403 | OK |
| **RBP-04** | pacientes | **RBAC** edicion | Token enfermero | PUT /api/pacientes/1 | 200 | OK |
| **RBP-05** | pacientes | **RBAC** borrado | Token enfermero | DELETE /api/pacientes/1 | 403 (solo admin) | OK |
| **RBP-06** | pacientes | **RBAC** borrado logico | Token admin | DELETE /api/pacientes/1 | 200 (desactiva) | OK |
| **RBP-07** | pacientes | **RBAC** lectura | Token laboratorio | GET /api/pacientes | 200 | OK |
| **RBP-08** | pacientes | **RBAC** reactivar | Token enfermero | PATCH /api/pacientes/1/reactivar | 403 (solo admin) | OK |
| **RBP-09** | pacientes | **RBAC** reactivar | Token admin | PATCH /api/pacientes/1/reactivar | 200 | OK |
| **RBF-01** | farmacia | **RBAC** inventario | Token laboratorio | POST /api/farmacia/medicamentos | 403 | OK |
| **RBF-02** | farmacia | **RBAC** dispensar | Token enfermero | POST /api/farmacia/dispensaciones | 403 | OK |
| **RBF-03** | farmacia | **RBAC** dispensar | Token farmacia | POST /api/farmacia/dispensaciones | 201 | OK |
| **RBF-04** | farmacia | **RBAC** lectura | Token medico_especialista | GET /api/farmacia/medicamentos | 200 | OK |
| **RBF-05** | farmacia | **RBAC** reactivar | Token farmacia | PATCH /medicamentos/1/reactivar | 403 (solo admin) | OK |
| **RBF-06** | farmacia | **RBAC** desactivar | Token farmacia | DELETE /medicamentos/1 | 200 | OK |
| **RBL-01** | laboratorio | **RBAC** ordenes | Token medico_especialista | GET /ordenes-pendientes | 403 | OK |
| **RBL-02** | laboratorio | **RBAC** catalogo | Token enfermero | GET /precios | 200 | OK |
| **RBL-03** | laboratorio | **RBAC** catalogo | Token laboratorio | POST /precios | 403 (solo admin) | OK |
| **RBL-04** | laboratorio | **RBAC** catalogo | Token admin | POST /precios | 201 | OK |
| **RBL-05** | laboratorio | **RBAC** catalogo | Token farmacia | PUT /precios/1 | 403 | OK |
| **RBI-01** | financiero | **RBAC** caja | Token coordinador_fundacion | POST /gastos | 403 | OK |
| **RBI-02** | financiero | **RBAC** caja | Token farmacia | POST /pagos-fundacion | 403 | OK |
| **RBI-03** | financiero | **RBAC** caja | Token admin | POST /gastos | 201 | OK |
| **RBI-04** | financiero | **RBAC** lectura | Token coordinador_fundacion | GET /gastos | 200 | OK |
| **RBI-05** | financiero | **RBAC** donantes | Token coordinador_fundacion | PATCH /donantes/1/desactivar | 403 | OK |
| **RBI-06** | financiero | **RBAC** donantes | Token admin | PATCH /donantes/1/reactivar | 200 | OK |
| **RBA-01** | auth | **RBAC** registro | Token farmacia | POST /api/auth/register | 403 (solo admin) | OK |
| **RBA-02** | auth | **RBAC** directorio | Sin token | GET /api/auth/usuarios | 401 | OK |
| **RBA-03** | auth | **RBAC** directorio | Token farmacia | GET /api/auth/usuarios | 403 | OK |
| **RBA-04** | auth | **RBAC** directorio | Token coordinador_fundacion | GET /api/auth/usuarios | 200 | OK |
| **RBA-05** | auth | **RBAC** cuentas | Token coordinador_fundacion | PATCH /usuarios/2/desactivar | 403 | OK |
| **RBA-06** | auth | **RBAC** cuentas | Token admin | PATCH /usuarios/2/reactivar | 200 | OK |

## Mapa a archivos

| Prefijo ID | Archivo | Casos |
|---|---|---|
| PS-xx | [pacientes-service/__tests__/SolicitudService.test.js](../pacientes-service/__tests__/SolicitudService.test.js) | 11 |
| PA-xx | [pacientes-service/__tests__/PacienteService.test.js](../pacientes-service/__tests__/PacienteService.test.js) | 6 |
| PV-xx | [pacientes-service/__tests__/PacienteActivo.test.js](../pacientes-service/__tests__/PacienteActivo.test.js) | 13 |
| AW-xx | [pacientes-service/__tests__/Auditoria.test.js](../pacientes-service/__tests__/Auditoria.test.js) | 10 |
| VM-xx | [pacientes-service/__tests__/VisitaMedicaService.test.js](../pacientes-service/__tests__/VisitaMedicaService.test.js) | 6 |
| SQA 14 | [pacientes-service/__tests__/VisitaIncompleta.test.js](../pacientes-service/__tests__/VisitaIncompleta.test.js) | 4 |
| SQA 19 | [pacientes-service/__tests__/CargoVisita.test.js](../pacientes-service/__tests__/CargoVisita.test.js) | 10 |
| SQA 15 | [pacientes-service/__tests__/CostoExamen.test.js](../pacientes-service/__tests__/CostoExamen.test.js) | 3 |
| SQA 5 | [pacientes-service/__tests__/FamiliarFicha.test.js](../pacientes-service/__tests__/FamiliarFicha.test.js) | 8 |
| RB-xx | [pacientes-service/__tests__/rbac.test.js](../pacientes-service/__tests__/rbac.test.js) | 9 |
| RBP-xx | [pacientes-service/__tests__/rbacPacientes.test.js](../pacientes-service/__tests__/rbacPacientes.test.js) | 9 |
| FS-xx | [farmacia-service/__tests__/FarmaciaService.test.js](../farmacia-service/__tests__/FarmaciaService.test.js) | 8 |
| FA-xx | [farmacia-service/__tests__/ActivoFarmacia.test.js](../farmacia-service/__tests__/ActivoFarmacia.test.js) | 5 |
| SQA 18 | [farmacia-service/__tests__/DespachoParcial.test.js](../farmacia-service/__tests__/DespachoParcial.test.js) | 6 |
| RBF-xx | [farmacia-service/__tests__/rbac.test.js](../farmacia-service/__tests__/rbac.test.js) | 6 |
| LS-xx | [laboratorio-service/__tests__/LaboratorioService.test.js](../laboratorio-service/__tests__/LaboratorioService.test.js) | 8 |
| LP-xx | [laboratorio-service/__tests__/PreciosExamen.test.js](../laboratorio-service/__tests__/PreciosExamen.test.js) | 8 |
| RBL-xx | [laboratorio-service/__tests__/rbac.test.js](../laboratorio-service/__tests__/rbac.test.js) | 5 |
| FI-xx | [financiero-service/__tests__/FinancieroService.test.js](../financiero-service/__tests__/FinancieroService.test.js) | 9 |
| FI-09..13 | [financiero-service/__tests__/MovimientosCaja.test.js](../financiero-service/__tests__/MovimientosCaja.test.js) | 5 |
| DA-xx | [financiero-service/__tests__/DonantesActivos.test.js](../financiero-service/__tests__/DonantesActivos.test.js) | 4 |
| SQA 20 | [financiero-service/__tests__/AbonosCargo.test.js](../financiero-service/__tests__/AbonosCargo.test.js) | 7 |
| SQA 20 | [financiero-service/__tests__/TitularCuenta.test.js](../financiero-service/__tests__/TitularCuenta.test.js) | 3 |
| SQA 21 | [financiero-service/__tests__/AlertasCobro.test.js](../financiero-service/__tests__/AlertasCobro.test.js) | 9 |
| RBI-xx | [financiero-service/__tests__/rbac.test.js](../financiero-service/__tests__/rbac.test.js) | 9 |
| AU-xx | [auth-service/__tests__/AuthService.test.js](../auth-service/__tests__/AuthService.test.js) | 11 |
| CU-xx | [auth-service/__tests__/CuentasActivas.test.js](../auth-service/__tests__/CuentasActivas.test.js) | 7 |
| SQA 25 | [auth-service/__tests__/HashPool.test.js](../auth-service/__tests__/HashPool.test.js) | 4 |
| RBA-xx | [auth-service/__tests__/rbac.test.js](../auth-service/__tests__/rbac.test.js) | 8 |
| RF-42 regla | [auth-service/__tests__/PasswordRegla.test.js](../auth-service/__tests__/PasswordRegla.test.js) | 19 |
| Límite | [auth-service/__tests__/LimitadorIntentos.test.js](../auth-service/__tests__/LimitadorIntentos.test.js) | 7 |
| RF-42 | [auth-service/__tests__/Recuperacion.test.js](../auth-service/__tests__/Recuperacion.test.js) | 9 |
| NO-xx | [notificaciones-service/__tests__/NotificacionesService.test.js](../notificaciones-service/__tests__/NotificacionesService.test.js) | 10 |
| SQA 24 | [pacientes-service/__tests__/IpCliente.test.js](../pacientes-service/__tests__/IpCliente.test.js) | 6 |
| SQA 6 | [pacientes-service/__tests__/Egreso.test.js](../pacientes-service/__tests__/Egreso.test.js) | 6 |
| AR-xx | [reportes-service/__tests__/AuditoriaConsulta.test.js](../reportes-service/__tests__/AuditoriaConsulta.test.js) | 10 |
| SQA 22/23 | [reportes-service/__tests__/ReportesExport.test.js](../reportes-service/__tests__/ReportesExport.test.js) | 11 |
| Bloque 3 | [reportes-service/__tests__/ReportesRango.test.js](../reportes-service/__tests__/ReportesRango.test.js) | 8 |
| Auditoría | [farmacia-service/__tests__/ValidacionMedicamento.test.js](../farmacia-service/__tests__/ValidacionMedicamento.test.js) | 15 |
| Auditoría | [financiero-service/__tests__/ValidacionValores.test.js](../financiero-service/__tests__/ValidacionValores.test.js) | 27 |
| Auditoría | [pacientes-service/__tests__/ValidacionEntradas.test.js](../pacientes-service/__tests__/ValidacionEntradas.test.js) | 16 |
| Auditoría | [notificaciones-service/__tests__/rbac.test.js](../notificaciones-service/__tests__/rbac.test.js) | 11 |
| Auditoría | [auth-service/__tests__/ManejoErrores.test.js](../auth-service/__tests__/ManejoErrores.test.js) | 13 |
| Auditoría | [frontend/__tests__/esc.test.js](../frontend/__tests__/esc.test.js) | 3 |
| | **Total** | **382** |

## Lo que todavia NO esta automatizado

- **Los 7 reportes**: ReportesExport.test.js y ReportesRango.test.js
  prueban el armado, las formulas del Excel, la validacion de filtros y el
  rango de fechas con un repositorio simulado; las consultas SQL de cada
  reporte solo las ejercita el e2e.
- **Cierre de sesion por inactividad** (frontend): probado a mano en el
  navegador con limites cortos (iniciarControlInactividad({ limiteMs,
  avisoMs })), sin prueba automatizada.
- **Token vigente tras desactivar una cuenta**: se bloquea el login, pero
  un JWT ya emitido sigue valido hasta su exp (8 h) en los demas
  servicios. Es una limitacion conocida, no un caso de prueba.
- **RBAC de visitas** (`PATCH /api/visitas/:id`, examenes, prescripciones,
  completar: solo `medico_especialista`) no tiene prueba unitaria de
  rechazo; desde el 26 oct lo cubre `npm run test:hostil` contra el stack.
- **Envio real por Brevo** (casos 10 y 11): las pruebas simulan `fetch`
  (incluido el `messageId` de Brevo) y el e2e corre en simulacion
  (`idMensajeProveedor = sim-...`). Nunca se envio un correo real; el procedimiento manual esta en
  [notificaciones-service/README.md](../notificaciones-service/README.md).
- **Frontend**: una sola prueba automatizada (`frontend/__tests__/esc.test.js`,
  el escape de HTML). Lo demas se verifica en el navegador por rol: el 26 oct
  con Chrome y scripts en la pagina (secciones, consola, textos, 390 px,
  dialogo de egreso, recuperar y restablecer contrasena). Las capturas de
  pantalla no se pudieron tomar (la extension no capturaba la ventana).

## Suite de integracion E2E (scripts/e2e-smoke.js)

Un renglon por paso, con el texto exacto que imprime el smoke (el numero
es el que aparece entre corchetes en la salida).

| ID | Paso |
|---|---|
| E2E-01 | login admin |
| E2E-02 | asegurar usuarios de prueba (medico_general, coord, especialista, laboratorio, farmacia, enfermero) |
| E2E-03 | crear paciente E2E (DPI unico por timestamp) |
| E2E-04 | medico_general: POST /api/solicitudes (dispara notificacion) |
| E2E-05 | coordinador: PATCH /api/solicitudes/:id/asignar-cita |
| E2E-06 | especialista: POST /api/solicitudes/:id/convertir-a-visita |
| E2E-07 | especialista: PATCH /api/visitas/:id (diagnostico+observaciones) |
| E2E-08 | especialista: POST /api/visitas/:id/examenes |
| E2E-09 | especialista: POST /api/visitas/:id/prescripciones con idMedicamento |
| E2E-10 | laboratorio: POST /api/laboratorio/resultados/examen/:idExamen |
| E2E-11 | caso 16: el especialista ve el examen disponible y lee el resultado |
| E2E-12 | farmacia: POST /api/farmacia/dispensaciones (RN-06 + RN-09) |
| E2E-13 | farmacia: segundo intento de dispensar -> 409 esperado |
| E2E-14 | especialista: POST /api/visitas/:id/completar |
| E2E-15 | notificaciones: existe una para este paciente |
| E2E-16 | financiero: GET /api/financiero/estado-cuenta/:idPaciente |
| E2E-17 | auth: GET /api/auth/me devuelve el usuario del token |
| E2E-18 | pacientes: PUT /:id actualiza telefono |
| E2E-19 | pacientes: DELETE /:id desactiva un paciente propio (borrado logico) |
| E2E-20 | reportes: los 7 tipos en JSON (status 200, columnas presentes) |
| E2E-21 | reportes: los 7 tipos en PDF (content-type application/pdf, no vacio) |
| E2E-22 | reportes: los 7 tipos en Excel (content-type xlsx, no vacio) |
| E2E-23 | RN-02: segunda solicitud activa misma especialidad -> 409 |
| E2E-24 | medico_general: PATCH /api/solicitudes/:id/cancelar -> cancelada |
| E2E-25 | inmutabilidad: cancelar una solicitud ya cancelada -> 409 |
| E2E-26 | RBAC backend: farmacia crea paciente, laboratorio crea medicamento, especialista dispensa -> 403 |
| E2E-27 | paciente activo: desactivado no recibe solicitudes (409); reactivado si |
| E2E-28 | auth: GET /api/auth/usuarios?rol=medico_especialista (coordinador ok, farmacia 403) |
| E2E-29 | laboratorio: costo del examen = precio del catalogo con RN-09 |
| E2E-30 | laboratorio: PUT /precios/:id sobre un precio propio (admin 200, laboratorio 403) |
| E2E-31 | caso 15: el examen queda con su costo con descuento al ordenarlo; cambiar el catalogo no lo altera |
| E2E-32 | financiero: POST /gastos (admin 201 y aparece en el listado, farmacia 403) |
| E2E-33 | financiero: POST /pagos-fundacion (admin 201 y aparece en el listado) |
| E2E-34 | paciente B propio con visita y prescripcion pendiente (preparacion) |
| E2E-35 | paciente desactivado: no recibe examenes ni dispensaciones (409); listados lo ocultan |
| E2E-36 | medicamento propio desactivado: no se dispensa (409) y sale del inventario |
| E2E-37 | cuenta desactivada: login 403, admin no se desactiva a si mismo (409), reactivada vuelve a entrar |
| E2E-38 | donante propio desactivado: donacion 409; reactivado: 201 |
| E2E-39 | auditoria: el paciente B tiene crear, desactivar y reactivar con usuario, IP, modulo y JSON |
| E2E-40 | caso 24: por el nginx se audita la IP del cliente; X-Forwarded-For inventado se ignora |
| E2E-41 | auditoria: dispensacion, visita y solicitud registradas; RBAC y validacion |
| E2E-42 | caso 19: el cierre genero un cargo desglosado con descuento en la cuenta |
| E2E-43 | caso 19: reintentar el cierre -> 409 y sigue habiendo un solo cargo de la visita |
| E2E-44 | caso 18: tras entregar 1 de 5 la prescripcion queda parcial y la visita acumula el costo |
| E2E-45 | caso 18: entregar mas de lo que falta (5 de 4) -> 409 sin tocar el stock |
| E2E-46 | caso 14: cerrar la visita B sin diagnostico ni observaciones -> 400, campos faltantes e incompleta |
| E2E-47 | caso 18/19: cerrar la visita B cobra lo entregado hasta ese momento |
| E2E-48 | caso 20: abonos al cargo de la visita B nunca dejan saldo negativo |
| E2E-49 | caso 18: completar la entrega despues del cierre -> dispensada y cargo complementario |
| E2E-50 | caso 5: alta sin familiar o con familiar incompleto -> 400 con los campos que faltan |
| E2E-51 | caso 5: el paciente E2E tiene familiar responsable completo y ficha medica 1:1 |
| E2E-52 | caso 13: la visita quedo en_atencion vinculada a la ficha del paciente |
| E2E-53 | caso 7: la solicitud lleva al enfermero; sin el o con un no-enfermero -> 400; enfermero y especialista no crean (403) |
| E2E-54 | caso 12: asignar cita dejo aviso interno al medico general y al enfermero; marcar leido |
| E2E-55 | caso 21: cuota con 5 dias de mora -> naranja, con 40 dias -> roja; pagada sale del panel |
| E2E-56 | caso 23: inyeccion SQL en login, pacientes, laboratorio y reportes -> texto literal o 400/401 |
| E2E-57 | caso 22: el Excel de costos por paciente tiene formulas SUM en los totales |
| E2E-58 | reportes: rango hoy-a-hoy incluye lo registrado hoy en los 7 reportes; ayer-a-ayer no |
| E2E-59 | RF-42: contrasena de 8+ con letra y numero en alta y cambio; mensajes claros |
| E2E-60 | limite: 5 fallos de login por IP + usuario y la sexta -> 429; /recuperar igual; X-Forwarded-For inventado no lo evita |
| E2E-61 | RF-42: recuperar contrasena (misma respuesta exista o no), enlace de un uso y login con la nueva |
| E2E-62 | limpieza: desactivar el medicamento propio del smoke |

Registros que el smoke deja en la base, todos marcados como de prueba:
pacientes "E2E Smoke" / "E2E Inactivable" / "E2E Descartable"
(desactivado), un medicamento "E2E medicamento <ts>" (desactivado al
final), el precio "E2E examen (no usar)" (reutilizado entre corridas),
donantes "E2E donante <ts>" y cuentas "e2e.desactivable.<ts>" (ambos
desactivados), gastos, pagos y donaciones de Q1 con concepto "E2E ...",
pacientes "E2E Caso 15" / "E2E Alerta naranja" / "E2E Alerta roja" y el
del caso 23 (nombre con texto SQL), con sus familiares "Familiar E2E
Responsable", solicitudes, visitas, cargos, cuotas y avisos, y sus
registros de auditoria. La prueba de carga deja pacientes "Carga <ts> #n"
desactivados (egreso "Fin de la prueba de carga") y sus solicitudes canceladas.
Los pasos RF-42 dejan las cuentas "e2e.recupera.<ts>" y "e2e.clave.<ts>" desactivadas; el paso del limite no escribe en la base (solo en la memoria de auth-service). Para una base de demo limpia:
`docker compose down -v` + `scripts/bootstrap.ps1` (sin correr el e2e).
