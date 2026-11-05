# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Las versiones siguen [SemVer](https://semver.org/lang/es/) y cada una es un
tag de git anotado. Cómo se usan con el SQA: [README, "Versiones y entregas
al SQA"](README.md#versiones-y-entregas-al-sqa).

Antes de v1.0.0 no había tags: el historial de abajo resume las rondas de
trabajo por fecha, tal como están en `git log`.

## [1.0.0] — 2026-11-04 · Entrega final

Primera versión con tag. Es la que se entrega al catedrático y la que debe
probar el SQA.

### Contenido de la versión
- 7 microservicios Node.js + Express con 4 capas (routes → controllers →
  services → repositories + models) y frontend HTML/CSS/JS servido por
  nginx, todo en Docker Compose; SQL Server compartido `AsiloCabezaAlgodon`.
- Pacientes con familiar responsable y ficha médica; egreso por borrado
  lógico.
- Solicitudes de referencia (RN-02), asignación de cita con avisos
  internos, visita médica con exámenes y prescripciones, cierre con cargo
  atómico al familiar (consulta + laboratorio + farmacia, RN-09).
- Farmacia con despacho parcial contra prescripción (RN-06), laboratorio
  con precios congelados al ordenar, financiero (cargos, abonos, cuotas con
  estado `vencida`, alertas naranja/roja, donaciones, gastos, pagos a la
  fundación), 7 reportes en pantalla, PDF y Excel.
- Seguridad: JWT HS256 con revocación al cerrar sesión, RBAC por rol en
  backend y UI, límite de intentos de login, recuperación de contraseña de
  un solo uso, auditoría con usuario, IP, módulo y JSON anterior/nuevo.
- Notificaciones por Brevo con reintentos (probado solo en simulación).
- Vistas de solo lectura con los nombres del Análisis (`internos`,
  `log_auditoria`, …).

### Cambiado en el cierre (4 nov 2026)
- Depuración: se quitaron un `require` y una función del frontend que
  nada usaba (sin cambio de comportamiento).
- Documentación de entrega: manual de usuario con capturas reales,
  `docs/MANUAL_TECNICO.md`, `docs/FALLAS_CONOCIDAS.md`, diagramas ER y de
  componentes en PNG (el de componentes ahora muestra el proxy de nginx y
  el ER incluye `tokens_revocados`), este CHANGELOG y la sección de
  versiones del README.
- Comentario que explica RN-02 en `SolicitudService`.

### Verificación de la versión
Stack recreado con `docker compose down -v` + `bootstrap.ps1`:
`test:todo` 415/415, `test:e2e` 62/62, `test:sqa` 23/23, `test:ui` 9/9,
`test:hostil` 370 sin problemas, `test:integridad` 20/20, `test:carga`
(50 usuarios) por debajo de 3 s. Detalle en
[docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md) y
[docs/RESULTADOS_PLAN_SQA.csv](docs/RESULTADOS_PLAN_SQA.csv).

## Historial anterior (sin tag)

### 2026-11-03 / 04 — Casos que el SQA reportó como NO CUMPLIDOS
El SQA probó desde la interfaz. Un commit por caso:
- Caso 1: cerrar sesión borra todo y revoca el token (`c1179fe`).
- Caso 9: alerta visible de solicitud duplicada RN-02 (`9b6989f`).
- Caso 14: un solo botón "Finalizar visita" (`5859cd6`, `d345871`).
- Caso 15: precio base, descuento y costo del examen en todas las vistas
  (`1fab64d`).
- Caso 18: despacho parcial visible en Farmacia y en la visita (`62a96c6`).
- Caso 19: la cuenta y la visita muestran qué se cobró y qué falta
  (`b04e6e8`).
- Caso 21: cuotas en estado `vencida` y alerta por cuota en el panel
  (`a5713da`).
- Caso 22: PDF con tabla real (`bd35e2e`).
- Caso 24: auditoría con IP propia y JSON rotulados (`7c42687`).
- Vistas con los nombres del Análisis (`5dcab13`) y pruebas de interfaz con
  Playwright (`e784139`).

### 2026-10-26 / 28 — Auditoría SQA final y vista móvil
Errores 5xx sin detalle, validaciones de entrada en todos los servicios,
textos legibles en la UI, rutas por sección, vista móvil (menú deslizante,
tablas como tarjetas, controles de 44 px), scripts `test:sqa`,
`test:hostil` e `test:integridad`.

### 2026-10-20 / 23 — Borrado lógico, auditoría y casos del plan SQA
Borrado lógico, pantalla de Usuarios, cierre por inactividad, auditoría con
IP real, egreso, recuperación de contraseña, casos 5-24 del plan del SQA
(familiar responsable, visita incompleta, costos congelados, despacho
parcial, cargo atómico, alertas de cobro, caída de Brevo).

### 2026-10-06 / 19 — Integración y pruebas
Prescripciones conectadas con farmacia (RN-06), reintentos de
notificaciones, suite jest + supertest, e2e, bootstrap en un comando,
identidad visual "Editorial Data-Dense", diálogos propios.

### 2026-09-03 / 27 — Construcción
Microservicio de farmacia inicial, migración a SQL Server, auth y
pacientes, solicitudes y visitas, y luego laboratorio, financiero,
reportes, notificaciones y el frontend completo.
