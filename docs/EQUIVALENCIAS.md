# Equivalencia de nombres: plan del SQA ↔ código

El plan de pruebas del SQA usa los nombres del documento de Análisis. El
código usa otros en algunos casos. **No se renombraron tablas**: esta
tabla dice dónde está cada concepto. Estados y roles se guardan en
minúsculas con guion bajo.

## Entidades y tablas

| Plan del SQA | Código (tabla / campo) | Servicio dueño |
|---|---|---|
| Interno | `pacientes` | pacientes-service |
| Estado inactivo del interno (egreso) | `pacientes.activo = 0` (BIT; `1` = activo) | pacientes-service |
| Solicitud de especialista | `solicitudes_referencia` | pacientes-service |
| Visita médica | `visitas_medicas` | pacientes-service |
| Orden de laboratorio | `visita_examenes` | pacientes-service (laboratorio la marca) |
| Resultado de laboratorio | `resultados_examenes` | laboratorio-service |
| Prescripción | `visita_prescripciones` | pacientes-service (farmacia la marca) |
| Despacho de farmacia | `dispensaciones` (`idPrescripcion`, `montoBase`, `costoTotal`) | farmacia-service |
| Costo preferencial acumulado en la visita | `visitas_medicas.costoLaboratorio` y `costoFarmacia` | pacientes-service (farmacia suma al despachar) |
| Cargo por despacho después del cierre | `cargos_servicio` con `origen = 'dispensacion'` e `idDispensacion` | farmacia-service, en la transacción del despacho |
| Cuenta / saldo | `cargos_servicio` + `cuotas_mensuales` por paciente; saldo = Σ(`monto` − `montoPagado`) de cargos no pagados + cuotas pendientes (calculado, no hay columna saldo) | financiero-service |
| Cargo automático de la visita | `cargos_servicio` con `origen = 'visita'` e `idVisita` (índice único: un cargo por visita) | lo escribe pacientes-service al cerrar la visita, en la misma transacción |
| Desglose del cargo (consulta / laboratorio / farmacia) | `cargos_detalle.rubro` = `consulta` / `laboratorio` / `farmacia` | financiero-service |
| Tarifa de consulta | `tarifas_servicio` con `codigo = 'consulta_especialista'` (semilla Q150.00) | financiero-service |
| Abono / pago a un cargo | `abonos_cargo`; suma ≤ monto del cargo (`cargos_servicio.montoPagado`, CHECK) | financiero-service |
| Familiar responsable (datos completos) | `familiares` (nombres, apellidos, dpi, parentesco, telefono, email, direccion; uno `principal` activo por paciente). `pacientes.familiarEmail` se mantiene como copia del correo del principal | pacientes-service; financiero-service lo lee como titular de la cuenta |
| Ficha médica (1:1 con el interno) | `fichas_medicas` (`idPaciente` UNIQUE); se crea con el alta y la visita la referencia en `visitas_medicas.idFichaMedica` | pacientes-service |
| Enfermero(a) que acompaña la solicitud | `solicitudes_referencia.idEnfermero` (usuario activo con rol `enfermero`) | pacientes-service |
| Notificación interna al personal | `avisos` (tipo `cita_asignada`, al médico general y al enfermero de la solicitud); `GET /api/avisos` | pacientes-service |
| Log de notificaciones | `notificaciones` | notificaciones-service |
| Bitácora de auditoría | `auditoria` | la escriben auth, pacientes, farmacia y financiero; la lee reportes |
| Usuario del sistema | `usuarios` | auth-service |

## Estados

| Plan del SQA | Código |
|---|---|
| PENDIENTE_ASIGNACION / CITA_ASIGNADA / EN_ATENCION | `pendiente_asignacion` / `cita_asignada` / `en_atencion` (solicitud) |
| Visita COMPLETA / INCOMPLETA | `completada` / `incompleta` (cierre rechazado por campos faltantes; sigue editable). `en_atencion` mientras se trabaja |
| Prescripción pendiente / parcial / despachada | `pendiente` / `parcial` / `dispensada` (`visita_prescripciones.cantidadPrescrita` y `cantidadEntregada`) |
| Examen pendiente / disponible | `pendiente` / `disponible` |
| Notificación enviado / error | `enviada` / `fallida` (reintentable) y `fallida_definitiva` (agotó intentos) |
| Cargo pendiente / pagado | `pendiente` / `parcial` (con abonos) / `pagado` |

## Roles

| Plan del SQA | Código (`usuarios.rol`) |
|---|---|
| Médico General | `medico_general` (`medico`, heredado) |
| Médico Especialista | `medico_especialista` (`especialista`, heredado) |
| Enfermero(a) | `enfermero` |
| Fundación / coordinación | `coordinador_fundacion` (`fundacion`, heredado) |
| Farmacia / Laboratorio | `farmacia` / `laboratorio` |
| Administrador | `admin` |

