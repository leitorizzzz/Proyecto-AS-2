# Plan de pruebas automatizadas

> Sistema de Gestion Integral — Asilo Cabeza de Algodon
> Elaborado por el equipo de desarrollo para la revision del SQA.

## Alcance y herramientas

Pruebas unitarias con **Jest 29** y pruebas de autorizacion con
**Supertest 7**. Cubren la capa de **logica de negocio** (donde viven las
reglas RN-xx) y el **pipe de middlewares** (autenticacion + autorizacion
por rol). Los repositorios se simulan con mocks para aislar las pruebas
de la base de datos.

Las pruebas NO requieren levantar el stack Docker. Se corren con:

```bash
./scripts/run-all-tests.sh         # Linux / Git Bash
./scripts/run-all-tests.ps1        # PowerShell
# o directamente
npm run test:todo
```

Ultima ejecucion: **45 casos, 45 OK, 0 falla**.

## Tabla de casos

Cada ID corresponde 1 a 1 con una prueba en el codigo
(`<servicio>/__tests__/<archivo>.test.js`). El SQA puede verificar
mapeo abriendo cada archivo.

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
| **FI-01** | financiero | Alerta nivel bajo | Saldo 450, umbral 1000 | estadoCuenta | alerta.nivel = 'bajo' | OK |
| **FI-02** | financiero | Alerta nivel alto | Saldo 1100, umbral 1000 | estadoCuenta | alerta.nivel = 'alto' + mensaje con umbral | OK |
| **FI-03** | financiero | Sin alerta | Saldo 0 | estadoCuenta | alerta = null | OK |
| **FI-04** | financiero | Validacion cargo | monto 0 o concepto vacio | generarCargo | 400 | OK |
| **FI-05** | financiero | Cargo OK | Datos validos | generarCargo | Cargo pendiente guardado | OK |
| **FI-06** | financiero | Cuota nueva | No existe cuota del periodo | registrarPagoCuota | Crea cuota + la paga | OK |
| **FI-07** | financiero | Cuota ya pagada | Cuota existente en estado 'pagada' | registrarPagoCuota | 409 "La cuota X/Y ya esta pagada" | OK |
| **FI-08** | financiero | Mes invalido | mes=13 | registrarPagoCuota | 400 "mes debe estar entre 1 y 12" | OK |
| **RB-01** | pacientes | **RBAC** sin token | Sin header Authorization | POST /api/solicitudes | 401 "Token no proporcionado" | OK |
| **RB-02** | pacientes | **RBAC** token invalido | Header con token basura | POST /api/solicitudes | 401 "Token invalido o expirado" | OK |
| **RB-03** | pacientes | **RBAC** rol equivocado | Token con rol admin | POST /api/solicitudes (requiere medico_general) | 403 | OK |
| **RB-04** | pacientes | **RBAC** rol correcto | Token con rol medico_general | POST /api/solicitudes | 201 | OK |
| **RB-05** | pacientes | **RBAC** asignar | Token medico_general | PATCH /:id/asignar-cita | 403 (solo coordinador o admin) | OK |
| **RB-06** | pacientes | **RBAC** asignar OK | Token coordinador_fundacion | PATCH /:id/asignar-cita | 200 | OK |
| **RB-07** | pacientes | **RBAC** convertir rol invalido | Token medico_general | POST /:id/convertir-a-visita | 403 | OK |
| **RB-08** | pacientes | **RBAC** convertir rol valido | Token medico_especialista | POST /:id/convertir-a-visita | 201 | OK |
| **RB-09** | pacientes | **RBAC** GET autenticado | Token enfermero | GET /api/solicitudes | 200 (lectura permitida a cualquier autenticado) | OK |

## Mapa a archivos

| Prefijo ID | Archivo |
|---|---|
| PS-xx | [pacientes-service/__tests__/SolicitudService.test.js](../pacientes-service/__tests__/SolicitudService.test.js) |
| VM-xx | [pacientes-service/__tests__/VisitaMedicaService.test.js](../pacientes-service/__tests__/VisitaMedicaService.test.js) |
| FS-xx | [farmacia-service/__tests__/FarmaciaService.test.js](../farmacia-service/__tests__/FarmaciaService.test.js) |
| LS-xx | [laboratorio-service/__tests__/LaboratorioService.test.js](../laboratorio-service/__tests__/LaboratorioService.test.js) |
| FI-xx | [financiero-service/__tests__/FinancieroService.test.js](../financiero-service/__tests__/FinancieroService.test.js) |
| RB-xx | [pacientes-service/__tests__/rbac.test.js](../pacientes-service/__tests__/rbac.test.js) |

## Casos pendientes de automatizar

- Pruebas de integracion end-to-end contra Docker (hoy se verifican a mano
  con los curl del commit de cada bloque; alimentan el guion de la demo).
- Flujo de reintentos de notificaciones con proveedor real; hoy se
  valida que la cola los recoge y marca `fallida_definitiva` al agotar
  intentos, pero las pruebas quedan en modo simulacion.
