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
| Despacho de farmacia | `dispensaciones` | farmacia-service |
| Cuenta / saldo | `cargos_servicio` + `cuotas_mensuales` por paciente; saldo = cargos pendientes + cuotas pendientes (calculado, no hay columna saldo) | financiero-service |
| Log de notificaciones | `notificaciones` | notificaciones-service |
| Bitácora de auditoría | `auditoria` | la escriben auth, pacientes, farmacia y financiero; la lee reportes |
| Usuario del sistema | `usuarios` | auth-service |

## Estados

| Plan del SQA | Código |
|---|---|
| PENDIENTE_ASIGNACION / CITA_ASIGNADA / EN_ATENCION | `pendiente_asignacion` / `cita_asignada` / `en_atencion` (solicitud) |
| Visita COMPLETA | `completada` (`en_atencion` mientras se trabaja) |
| Prescripción pendiente / despachada | `pendiente` / `dispensada` |
| Examen pendiente / disponible | `pendiente` / `disponible` |
| Notificación enviado / error | `enviada` / `fallida` (reintentable) y `fallida_definitiva` (agotó intentos) |
| Cargo pendiente | `pendiente` |

## Roles

| Plan del SQA | Código (`usuarios.rol`) |
|---|---|
| Médico General | `medico_general` (`medico`, heredado) |
| Médico Especialista | `medico_especialista` (`especialista`, heredado) |
| Enfermero(a) | `enfermero` |
| Fundación / coordinación | `coordinador_fundacion` (`fundacion`, heredado) |
| Farmacia / Laboratorio | `farmacia` / `laboratorio` |
| Administrador | `admin` |

