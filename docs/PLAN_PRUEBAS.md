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
`jsonwebtoken` y `bcryptjs` estan como devDependencies de la raiz para que
las pruebas corran en un clon limpio sin instalar cada servicio.
```bash
./scripts/run-all-tests.sh         # Linux / Git Bash
./scripts/run-all-tests.ps1        # PowerShell
npm run test:todo
```
Ultima ejecucion (19 oct 2026): **102 casos en 16 archivos, 102 OK, 0 fallas**.

**(2) Integracion end-to-end**: requieren el stack docker-compose
arriba. Recorren el flujo completo de un paciente, con usuarios reales
y JWT, contra las APIs HTTP. Un paso por linea con [ OK ] / [FALLA].
```bash
npm run test:e2e                         # localhost
BASE_HOST=100.96.172.77 npm run test:e2e  # servidor Debian
```
Ultima ejecucion (19 oct 2026, stack local): **31 pasos, 31 OK**.

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
| **PA-05** | pacientes | Borrado con historial | El repo lanza error SQL 547 (FK) | eliminar(1) | 409 "tiene solicitudes o visitas" | OK |
| **PA-06** | pacientes | 404 | Paciente inexistente | eliminar(99) | Error "Paciente no encontrado" | OK |
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
| **RBP-06** | pacientes | **RBAC** borrado | Token admin | DELETE /api/pacientes/1 | 204 | OK |
| **RBP-07** | pacientes | **RBAC** lectura | Token laboratorio | GET /api/pacientes | 200 | OK |
| **RBF-01** | farmacia | **RBAC** inventario | Token laboratorio | POST /api/farmacia/medicamentos | 403 | OK |
| **RBF-02** | farmacia | **RBAC** dispensar | Token enfermero | POST /api/farmacia/dispensaciones | 403 | OK |
| **RBF-03** | farmacia | **RBAC** dispensar | Token farmacia | POST /api/farmacia/dispensaciones | 201 | OK |
| **RBF-04** | farmacia | **RBAC** lectura | Token medico_especialista | GET /api/farmacia/medicamentos | 200 | OK |
| **RBL-01** | laboratorio | **RBAC** ordenes | Token medico_especialista | GET /ordenes-pendientes | 403 | OK |
| **RBL-02** | laboratorio | **RBAC** catalogo | Token enfermero | GET /precios | 200 | OK |
| **RBL-03** | laboratorio | **RBAC** catalogo | Token laboratorio | POST /precios | 403 (solo admin) | OK |
| **RBL-04** | laboratorio | **RBAC** catalogo | Token admin | POST /precios | 201 | OK |
| **RBL-05** | laboratorio | **RBAC** catalogo | Token farmacia | PUT /precios/1 | 403 | OK |
| **RBI-01** | financiero | **RBAC** caja | Token coordinador_fundacion | POST /gastos | 403 | OK |
| **RBI-02** | financiero | **RBAC** caja | Token farmacia | POST /pagos-fundacion | 403 | OK |
| **RBI-03** | financiero | **RBAC** caja | Token admin | POST /gastos | 201 | OK |
| **RBI-04** | financiero | **RBAC** lectura | Token coordinador_fundacion | GET /gastos | 200 | OK |
| **RBA-01** | auth | **RBAC** registro | Token farmacia | POST /api/auth/register | 403 (solo admin) | OK |
| **RBA-02** | auth | **RBAC** directorio | Sin token | GET /api/auth/usuarios | 401 | OK |
| **RBA-03** | auth | **RBAC** directorio | Token farmacia | GET /api/auth/usuarios | 403 | OK |
| **RBA-04** | auth | **RBAC** directorio | Token coordinador_fundacion | GET /api/auth/usuarios | 200 | OK |

## Mapa a archivos

| Prefijo ID | Archivo | Casos |
|---|---|---|
| PS-xx | [pacientes-service/__tests__/SolicitudService.test.js](../pacientes-service/__tests__/SolicitudService.test.js) | 8 |
| PA-xx | [pacientes-service/__tests__/PacienteService.test.js](../pacientes-service/__tests__/PacienteService.test.js) | 6 |
| VM-xx | [pacientes-service/__tests__/VisitaMedicaService.test.js](../pacientes-service/__tests__/VisitaMedicaService.test.js) | 5 |
| RB-xx | [pacientes-service/__tests__/rbac.test.js](../pacientes-service/__tests__/rbac.test.js) | 9 |
| RBP-xx | [pacientes-service/__tests__/rbacPacientes.test.js](../pacientes-service/__tests__/rbacPacientes.test.js) | 7 |
| FS-xx | [farmacia-service/__tests__/FarmaciaService.test.js](../farmacia-service/__tests__/FarmaciaService.test.js) | 8 |
| RBF-xx | [farmacia-service/__tests__/rbac.test.js](../farmacia-service/__tests__/rbac.test.js) | 4 |
| LS-xx | [laboratorio-service/__tests__/LaboratorioService.test.js](../laboratorio-service/__tests__/LaboratorioService.test.js) | 7 |
| LP-xx | [laboratorio-service/__tests__/PreciosExamen.test.js](../laboratorio-service/__tests__/PreciosExamen.test.js) | 8 |
| RBL-xx | [laboratorio-service/__tests__/rbac.test.js](../laboratorio-service/__tests__/rbac.test.js) | 5 |
| FI-01..08 | [financiero-service/__tests__/FinancieroService.test.js](../financiero-service/__tests__/FinancieroService.test.js) | 8 |
| FI-09..13 | [financiero-service/__tests__/MovimientosCaja.test.js](../financiero-service/__tests__/MovimientosCaja.test.js) | 5 |
| RBI-xx | [financiero-service/__tests__/rbac.test.js](../financiero-service/__tests__/rbac.test.js) | 4 |
| AU-xx | [auth-service/__tests__/AuthService.test.js](../auth-service/__tests__/AuthService.test.js) | 7 |
| RBA-xx | [auth-service/__tests__/rbac.test.js](../auth-service/__tests__/rbac.test.js) | 4 |
| NO-xx | [notificaciones-service/__tests__/NotificacionesService.test.js](../notificaciones-service/__tests__/NotificacionesService.test.js) | 7 |
| | **Total** | **102** |

## Lo que todavia NO esta automatizado

- **reportes-service** no tiene pruebas unitarias; solo lo cubre el e2e
  (E2E-19 a E2E-21: los 7 reportes responden y los archivos tienen firma
  valida, sin verificar el contenido de cada fila).
- **RBAC de visitas** (`PATCH /api/visitas/:id`, examenes, prescripciones,
  completar: solo `medico_especialista`) no tiene prueba de rechazo; el
  e2e solo recorre el camino permitido.
- **Envio real por Brevo**: NO-03/NO-04 simulan `fetch`. Nunca se envio
  un correo real; el procedimiento manual esta en
  [notificaciones-service/README.md](../notificaciones-service/README.md).
- **Frontend**: sin pruebas automatizadas. Se verifica a mano en el
  navegador por rol (ver el manual de usuario).

## Suite de integracion E2E (scripts/e2e-smoke.js)

| ID | Paso | Valida |
|---|---|---|
| E2E-01 | login admin | Credenciales admin del seed |
| E2E-02 | asegurar 5 usuarios de rol | register con admin (RBAC) |
| E2E-03 | crear paciente con DPI unico | pacientes-service POST |
| E2E-04 | medico_general crea solicitud | **dispara notificacion fire-and-forget** |
| E2E-05 | coordinador asigna cita | transicion a `cita_asignada` |
| E2E-06 | especialista convierte en visita | transicion a `en_atencion` |
| E2E-07 | PATCH diagnostico + observaciones | precondicion para completar |
| E2E-08 | agregar examen | genera orden pendiente para laboratorio |
| E2E-09 | agregar prescripcion con idMedicamento | precondicion para RN-06 |
| E2E-10 | laboratorio registra resultado | lectura cross-service de `visita_examenes` |
| E2E-11 | farmacia dispensa | RN-06 + RN-09 end-to-end |
| E2E-12 | segundo intento de dispensar | debe fallar con 409 (idempotencia RN-06) |
| E2E-13 | completar visita | transicion a `completada`, inmutabilidad |
| E2E-14 | verificar notificacion | HTTP cross-service pacientes->notificaciones |
| E2E-15 | estado de cuenta financiero | lectura cross-service |
| E2E-16 | GET /api/auth/me | token devuelve el usuario correcto |
| E2E-17 | PUT /api/pacientes/:id | actualizacion de paciente persiste |
| E2E-18 | DELETE /api/pacientes/:id + GET 404 | borrado efectivo de un paciente sin historial |
| E2E-19 | 7 reportes en JSON (columnas presentes) | reportes-service formato json |
| E2E-20 | 7 reportes en PDF (firma %PDF, >500 B, content-type) | pdfkit genera PDF valido |
| E2E-21 | 7 reportes en Excel (firma PK, >500 B, content-type) | exceljs genera XLSX valido |
| E2E-22 | segunda solicitud activa en la misma especialidad | **RN-02** -> 409 |
| E2E-23 | medico_general cancela una solicitud | transicion a `cancelada` |
| E2E-24 | cancelar otra vez la misma solicitud | inmutabilidad -> 409 |
| E2E-25 | farmacia crea paciente, laboratorio crea medicamento, especialista dispensa | RBAC del backend -> 3 x 403 |
| E2E-26 | DELETE de un paciente con solicitudes | 409 con mensaje claro (no se borra) |
| E2E-27 | GET /api/auth/usuarios?rol=medico_especialista | coordinador 200 sin passwordHash; farmacia 403 |
| E2E-28 | costo del examen vs catalogo de precios | **RN-09** end-to-end en laboratorio |
| E2E-29 | PUT /precios/:id con el mismo valor | admin 200, laboratorio 403 |
| E2E-30 | POST /gastos | admin 201 y aparece en el listado; farmacia 403 |
| E2E-31 | POST /pagos-fundacion | admin 201 y aparece en el listado |

Los pasos E2E-03, E2E-30 y E2E-31 dejan registros de prueba en la base
(pacientes "E2E Smoke", gastos y pagos de Q1 con concepto "E2E ...").
