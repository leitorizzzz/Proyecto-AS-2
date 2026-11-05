# Fallas conocidas, límites y mensajes de error

Sistema de Gestión Integral — Asilo "Cabeza de Algodón", versión **v1.0.0**.

Este documento dice con honestidad qué hace el sistema, qué **no** hace,
en qué se aparta del Análisis y qué significa cada mensaje de error que
puede ver una persona usuaria. Todo lo que aparece aquí está en el código
de esta versión; el detalle técnico de cada punto está en
[CLAUDE.md](../CLAUDE.md#desviaciones-respecto-al-análisis) y en
[MANUAL_TECNICO.md](MANUAL_TECNICO.md).

---

## 1. Qué hace el sistema

- Registra residentes (internos) con su **familiar responsable** y su
  **ficha médica**; el egreso es un borrado lógico con fecha y motivo.
- Flujo de atención: el médico general crea la **solicitud de referencia**
  (una sola activa por paciente y especialidad, RN-02), la coordinación
  **asigna cita** (con avisos internos), el especialista **inicia la
  visita**, pide **exámenes** y **prescripciones** y la **finaliza**
  (diagnóstico y observaciones obligatorios; si faltan, queda
  `incompleta`).
- Al finalizar una visita genera **en la misma transacción** el cargo al
  familiar: consulta + laboratorio + farmacia, con el **20 %** de la
  fundación (RN-09). Nunca dos cargos por visita.
- **Farmacia** dispensa solo contra una prescripción con medicamento del
  inventario (RN-06), por partes, sin pasar de lo prescrito; lo despachado
  después del cierre genera un cargo complementario automático.
- **Laboratorio** registra resultados; el precio del examen se congela al
  ordenarlo.
- **Financiero**: estado de cuenta, abonos (nunca saldo negativo), cuotas
  mensuales que pasan a `vencida`, alertas naranja/roja por cuota y por
  saldo, donantes y donaciones, gastos operativos y pagos a la fundación.
- **7 reportes** en pantalla, PDF y Excel (con fórmulas).
- **Seguridad**: login con JWT, permisos por rol en el servidor y en la
  pantalla, límite de 5 intentos fallidos en 15 minutos, recuperación de
  contraseña por correo (enlace de un uso, 30 min), cierre por
  inactividad (30 min) y al cerrar sesión el token queda revocado.
- **Auditoría** de altas, cambios, cancelaciones, desactivaciones y
  reactivaciones con usuario, IP, módulo y JSON anterior/nuevo.
- Correo al familiar al crear una solicitud, con reintentos automáticos.

## 2. Qué NO hace

| No hace | Consecuencia / alternativa |
|---|---|
| HTTPS | Todo viaja en HTTP (puerto 8090 y 3000-3006). Por Tailscale el túnel va cifrado; en la red local no. |
| Revocar las sesiones al **desactivar** una cuenta | La persona desactivada no puede volver a entrar, pero una sesión que ya tenía abierta sigue funcionando hasta 8 horas. Cerrar sesión sí revoca el token al instante. |
| Enviar correos reales comprobados | Todo se probó en modo simulación (`MODO_SIMULACION=true`). El envío por Brevo real no se ejecutó nunca. |
| Entregar por correo el enlace de recuperación de contraseña (en el prototipo) | El envío es simulado: el enlace queda registrado en el servidor y no llega a ningún buzón. Para la demo, quien administra el equipo lo obtiene con `npm run enlace-recuperacion -- <correo>` (solo en el stack local, con `docker exec`). Con Brevo configurado el usuario lo recibe por correo. |
| Asociar un medicamento a una prescripción ya emitida sin él | El especialista debe emitir otra prescripción eligiendo el medicamento del inventario. |
| Pantallas para el alta/edición de inventario, el log de notificaciones y su reintento manual | Existen solo por API (ver MANUAL_TECNICO). |
| Mostrar los gastos operativos en un reporte | Se consultan en la tabla de Financiero; ningún reporte los incluye. |
| Paginación de tablas y reportes | Auditoría muestra máximo 200 registros; los reportes traen todo el rango. |
| Cambiar la contraseña desde la pantalla | `POST /api/auth/cambiar-password` existe solo por API; desde la pantalla se usa "¿Olvidaste tu contraseña?". |
| Pruebas en navegadores distintos de Chromium ni en teléfono físico | La vista móvil se revisó con capturas a 390 y 768 px. |

## 3. Desviaciones respecto al Análisis

Resumen de las 16 de [CLAUDE.md](../CLAUDE.md#desviaciones-respecto-al-análisis).
Ninguna rompe una regla de negocio; son límites aceptados para la
entrega académica.

1. **HTTP sin HTTPS** (ver arriba).
2. **Sesiones vigentes tras desactivar una cuenta** (hasta 8 h). Si la base
   no responde al consultar los tokens revocados, el token se acepta igual.
3. **Brevo real no verificado.**
4. **Comunicación mixta entre servicios**: varios servicios leen y
   escriben tablas de otros en la base compartida; solo notificaciones va
   por HTTP.
5. **Una sola base y el usuario `sa`** para los 7 servicios (sin usuario
   por servicio con permisos mínimos).
6. **Token en `localStorage`**, no en cookie `HttpOnly`.
7. **Puertos de los servicios y de SQL Server publicados** y CORS abierto.
8. **Nombres distintos al plan del SQA** (`pacientes` en vez de internos,
   `activo = 0` en vez de `estado = 'inactivo'`, `fallida_definitiva` en
   vez de "error"…). Para consultar con los nombres del Análisis existen
   vistas de solo lectura ([EQUIVALENCIAS.md](EQUIVALENCIAS.md)).
9. **Auditoría parcial**: laboratorio y notificaciones no auditan.
10. **Reportes** sin gastos operativos y sin paginación.
11. **Frontend con pocas pruebas automatizadas** (una unitaria y 9 casos
    del SQA con Playwright).
12. ~~Entrega impresa incompleta~~: resuelto en v1.0.0 (manual con
    capturas, diagramas en PNG).
13. **Dependencias sin `package-lock.json`** en laboratorio, financiero,
    reportes y notificaciones (aviso `EBADENGINE` con Node 20).
14. **Lecturas abiertas a cualquier usuario autenticado** por API (estado
    de cuenta, donantes, reportes…); la pantalla oculta esas secciones.
15. **El médico general elige el correo destino** de la notificación de
    solicitud; no se compara con el familiar registrado.
16. ~~Botones de tabla por debajo de 44 px~~: resuelto con la vista móvil.

Además, en una instalación con **Docker Desktop** (Windows/macOS) la
auditoría registra la IP `172.18.0.1` para todos; en el servidor Debian se
registra la IP real (no verificado con un acceso real por Tailscale/LAN).

## 4. Mensajes de error y qué hacer

Todos los mensajes aparecen bajo el botón o dentro de la ventana, con el
prefijo **Error —** (rechazo) o **Aviso —** (atención). Los textos de abajo
son los del sistema; donde dice *N*, *X* va el dato real.

### Sesión y acceso

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| *Credenciales inválidas* | Correo o contraseña incorrectos. | Revisar mayúsculas y el correo. Tras 5 intentos se bloquea 15 min. |
| *Demasiados intentos. Por seguridad, espere N minutos antes de volver a intentarlo.* | 5 intentos fallidos (o 5 pedidos de recuperación) desde ese equipo y correo. | Esperar los minutos indicados o usar "¿Olvidaste tu contraseña?". |
| *Cuenta desactivada. Pida a administracion que la reactive.* | Administración desactivó la cuenta. | Pedir la reactivación en Usuarios. |
| *Escriba su correo y su contraseña* | Algún campo quedó vacío. | Completar ambos. |
| *Su sesión expiró o no es válida. Vuelva a iniciar sesión.* | El token venció (8 h), se cerró la sesión en otra pestaña o fue revocado. | Iniciar sesión otra vez. |
| *Sesión cerrada por inactividad (30 min). Vuelva a iniciar sesión.* | 30 minutos sin usar el sistema. | Iniciar sesión otra vez. |
| *El enlace de recuperación no es válido o ya venció. Solicite uno nuevo.* | El enlace se usó, venció (30 min) o se pidió uno más nuevo. | Pedir otro enlace. |
| *Su usuario no tiene permiso para realizar esta acción.* | El rol no puede hacer esa operación. | Pedirla a quien tenga el rol (ver Manual de usuario §2.2). |

### Pacientes y familiar

| Mensaje | Qué hacer |
|---|---|
| *Datos del familiar responsable incompletos: …* | Completar los campos que lista (nombres, apellidos, DPI de 13 dígitos, parentesco, teléfono, correo, dirección). |
| *Ya existe otro paciente con ese DPI* | Revisar el DPI; buscar si el paciente ya está (o desactivado: marcar "Ver también desactivados"). |
| *El DPI debe tener exactamente 13 dígitos* | Escribir solo los 13 números. |
| *La fecha de nacimiento no puede ser futura ni anterior a 1900* | Corregir la fecha. |
| *El paciente X esta desactivado: no se puede …. Un administrador puede reactivarlo.* | Administración debe reactivarlo en Pacientes antes de registrarle algo. |
| *El paciente no tiene familiar responsable registrado: registrelo antes de cerrar la visita* | Enfermería o administración: botón **Familiar** en la fila del paciente. |

### Solicitudes y visitas

| Mensaje | Qué hacer |
|---|---|
| Ventana *Ya existe una solicitud activa* (RN-02) | No se crea otra: usar **Ver solicitud activa**; esperar a que se complete o cancelarla. |
| *El usuario N no es un enfermero activo* / *no es un médico especialista activo* | Elegir otra persona de la lista; pedir a administración que reactive la cuenta si corresponde. |
| *La fecha de la cita no puede ser anterior a hoy* | Elegir hoy o una fecha posterior. |
| *Solo se asigna cita a solicitudes pendientes de cita; esta solicitud está …* | La solicitud cambió de estado; recargar la bandeja. |
| *No se finalizó la visita. Faltan: …* (visita queda INCOMPLETA) | Completar los campos resaltados y volver a pulsar **Finalizar visita**. |
| *Falta la cantidad* (prescripción a medio llenar) | Escribir la cantidad o borrar la prescripción a medio llenar. |
| *No hay precio configurado para el tipo de examen …* | Administración debe agregarlo en Laboratorio → **Precios de exámenes**; el nombre debe coincidir exactamente. |
| *No hay tarifa de consulta configurada (…)* | Falta la tarifa `consulta_especialista` en la base; avisar a soporte técnico. |
| *Solo se edita una visita en atención o incompleta; esta visita está …* | Una visita completada o cancelada ya no se modifica. |

### Farmacia

| Mensaje | Qué hacer |
|---|---|
| *Elija la prescripción a dispensar: solo se entrega lo que un médico recetó en una visita.* | Elegir paciente y prescripción pendiente. |
| *La cantidad N excede lo pendiente de la prescripción …* | Entregar como máximo lo que falta (se ve en la lista). |
| *Stock insuficiente de X. Disponible: N* | Reabastecer el inventario (por API) o entregar menos. |
| *La prescripción N no tiene medicamento del inventario asociado…* | El especialista debe emitir otra prescripción eligiendo el medicamento. |
| *El medicamento X está desactivado en el inventario* | Administración puede reactivarlo. |
| *Ya existe en el inventario …* | Ese nombre y presentación ya están activos. |

### Financiero

| Mensaje | Qué hacer |
|---|---|
| *El abono QX excede el saldo del cargo (QY): no se permiten saldos negativos* | Abonar como máximo el saldo. |
| *El cargo N ya está pagado* / *La cuota M/A ya está pagada* | Nada que cobrar. |
| *La cuota M/A del paciente N ya existe* | Usar **Registrar pago** sobre esa cuota en lugar de emitir otra. |
| *El paciente N no tiene familiar responsable registrado…* | Registrar el familiar antes de cargos o cuotas. |
| Montos: *debe ser mayor a 0 … con 2 decimales* | Escribir el monto en quetzales con punto decimal (ej. 150.00). |
| *El donante X esta desactivado…* | Reactivarlo o elegir otro donante. |

### Errores generales

| Mensaje | Qué hacer |
|---|---|
| *Ocurrió un error interno. Intente de nuevo; si persiste, avise a administración.* | Reintentar; si se repite, soporte técnico revisa `docker compose logs <servicio>` (el detalle queda solo en el log). |
| *El servicio no respondió. Intente de nuevo en unos momentos.* | Un servicio está reiniciando o caído: esperar 1 minuto; soporte técnico revisa `docker compose ps`. |
| *El cuerpo de la petición no es un JSON válido* / *La petición es demasiado grande* | Solo ocurre al usar la API directamente; revisar lo enviado. |

## 5. Si algo no funciona (soporte técnico)

1. `docker compose ps`: los 9 contenedores deben estar `Up` (SQL Server
   `healthy`).
2. `docker compose logs --tail 50 <servicio>`: el detalle de cualquier
   error 500 está ahí.
3. Reiniciar un servicio: `docker compose restart <servicio>`.
4. Base de pruebas dañada: `docker compose down -v` + `bootstrap` (borra
   todos los datos; **nunca** en el servidor con datos reales).
