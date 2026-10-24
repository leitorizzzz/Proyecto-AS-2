# CONTEXT.md — Sistema para Administración del Asilo de Ancianos "Cabeza de Algodón"

> Universidad Mariano Gálvez de Guatemala — Centro Regional de Mazatenango
> Proyecto Final: Análisis y Diseño de Sistemas II — Ing. Angel Atilio Maltez C.

Este archivo describe el contexto completo del **sistema**, no solo de un
módulo individual. El microservicio de Farmacia (`farmacia-service/`) es
**una pieza** dentro de este sistema más grande.

---

## 1. Qué es el sistema

Software para que el Asilo de Ancianos "Cabeza de Algodón" gestione sus
operaciones y el registro de sus internos (pacientes). Actualmente el asilo
lleva fichas físicas con control de psicopatología y medicamentos; el
sistema debe digitalizar y automatizar ese proceso, además de manejar la
relación con una **fundación** que provee médicos especialistas, laboratorio
clínico y farmacia con precios preferenciales para los pacientes del asilo.

### Actores / roles del sistema
- **Enfermero(a)**: registra pacientes, acompaña al paciente al ser
  referido a un especialista.
- **Médico general**: primer contacto, evalúa y refiere a especialidad.
- **Médico especialista**: recibe la solicitud, registra la visita médica
  (diagnóstico, exámenes, medicamento) en la ficha del paciente.
- **Fundación**: recibe las solicitudes de especialista y asigna horario y
  médico.
- **Laboratorio**: recibe pacientes referidos, realiza exámenes y sube
  resultados a la visita médica.
- **Farmacia**: dispensa medicamentos indicados en la visita médica.
- **Administración / Finanzas**: controla donaciones, cobros a familiares,
  gastos y pagos a la fundación.
- **Familiar del paciente**: recibe notificaciones por correo sobre el
  estado de su familiar.

---

## 2. Arquitectura general del sistema

Definida en el documento de arquitectura entregado: **arquitectura N-Tier /
por capas**, con posibilidad de despliegue híbrido Cloud + On-Premise
(ej. base de datos local con Cloudflare Tunnel o VPN, backend/frontend en
cloud).

A nivel de **estructura interna de cada módulo/microservicio**, el
catedrático pide específicamente **4 capas**:

```
Presentación → Lógica de Negocio (Servicios/Controladores) → Acceso a Datos (Repositorio) → Entidades/Modelos
```

Esta estructura de 4 capas es la que se debe replicar en **cada módulo** que
se construya (farmacia, laboratorio, pacientes, financiero, etc.), para que
todo el sistema sea consistente.

> Nota de consistencia: el primer documento entregado (arquitectura general)
> habla de "3 capas clásicas" a nivel conceptual del sistema completo; el
> desglose de 4 capas es el detalle técnico interno de cada módulo, pedido
> explícitamente por el catedrático. No son arquitecturas contradictorias,
> son dos niveles de detalle distintos (ver aclaración ya documentada en
> conversaciones previas del proyecto).

---

## 3. Módulos del sistema (según el enunciado del proyecto)

| Módulo | Descripción | Estado |
|---|---|---|
| **Autenticación** | JWT centralizado, registro (solo admin), login, RBAC | ✅ `auth-service/` |
| **Pacientes / Fichas médicas** | Registro de internos, historial médico, padecimientos | ✅ Dentro de `pacientes-service/` |
| **Solicitudes a especialista** | Médico general refiere a especialidad; fundación asigna horario y médico | ✅ Dentro de `pacientes-service/` |
| **Visita médica** | Diagnóstico, observaciones, exámenes, prescripciones | ✅ Dentro de `pacientes-service/` |
| **Laboratorio** | Órdenes pendientes desde visita, registro de resultados, costo con descuento fundación (RN-09) | ✅ `laboratorio-service/` |
| **Farmacia** | Inventario y dispensación de medicamentos con descuento fundación | ✅ `farmacia-service/` |
| **Entradas, Salidas y Caja** | Donaciones, cobros a familiares, gastos, pagos a fundación, estado de cuenta con alerta de saldo | ✅ `financiero-service/` |
| **Reportes** | Los 7 reportes del enunciado, exportables a JSON, PDF (pdfkit) o Excel (exceljs) | ✅ `reportes-service/` |
| **Notificaciones** | Correo automático al familiar (Brevo) al crear una solicitud médica; modo simulación para dev | ✅ `notificaciones-service/` |
| **Frontend** | Login + Panel + 7 pantallas (Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Financiero, Reportes) + 2 de administración (Usuarios, Auditoría) | ✅ `frontend/` (nginx, HTML/CSS/JS plano) |

### 3.1 Nota sobre agrupación en `pacientes-service`

Solicitudes de Referencia y Visita Médica **no** viven en microservicios
separados: van dentro de `pacientes-service` como dominios adicionales
porque dependen directamente del Paciente y comparten el mismo agregado
transaccional (crear visita ⇒ transicionar solicitud). Esto sigue siendo
arquitectura de microservicios; lo que se agrupa es lo fuertemente
acoplado. Cada dominio conserva sus propias 4 capas dentro del servicio:

```
pacientes-service/src/
├── controllers/  PacienteController · SolicitudController · VisitaMedicaController
├── routes/       pacientesRoutes    · solicitudRoutes     · visitaMedicaRoutes
├── services/     PacienteService    · SolicitudService    · VisitaMedicaService
├── repositories/ PacienteRepository · SolicitudRepository · VisitaMedicaRepository
├── models/       Paciente           · SolicitudReferencia · VisitaMedica
└── middleware/   authMiddleware · autorizarRoles (copiados desde auth-service)
```

### 3.2 Flujo Solicitud → Visita (RF-08 a RF-16)

```
[medico_general]           [coordinador_fundacion | admin]      [medico_especialista]
POST /api/solicitudes  →   PATCH .../asignar-cita           →   POST .../convertir-a-visita
pendiente_asignacion       cita_asignada                        en_atencion
                                                                   │
                                                                   ├─ PATCH /api/visitas/:id  (diagnóstico + observaciones)
                                                                   ├─ POST  /api/visitas/:id/examenes
                                                                   ├─ POST  /api/visitas/:id/prescripciones
                                                                   └─ POST  /api/visitas/:id/completar
                                                                          │  faltan campos → 400, visita `incompleta` (editable)
                                                                          ▼
                                                                      completada + cargo (misma transacción)
Cancelación (medico_general | admin) desde cualquier estado previo a completada → cancelada.
```

**Reglas de negocio implementadas:**

- **Alta de interno (caso 5)**: exige familiar responsable completo
  (nombres, apellidos, DPI de 13 dígitos, parentesco, teléfono, email,
  dirección) → `400` con `camposFaltantes`. En la misma transacción se
  crean `familiares` (uno principal activo) y `fichas_medicas` (1:1).
- **Solicitud (casos 7 y 9)**: exige `idEnfermero` (usuario activo con rol
  `enfermero`). **RN-02**: un paciente no puede tener dos solicitudes
  activas (`pendiente_asignacion`, `cita_asignada`, `en_atencion`) para la
  misma especialidad. Duplicado → `409` con `solicitudActiva {id, estado}`.
- **Asignar cita (caso 12)**: deja avisos internos (`avisos`) al médico
  general y al enfermero de la solicitud en la misma transacción.
- **Visita (casos 13 y 14)**: queda vinculada a la ficha
  (`idFichaMedica`). Completar exige `diagnostico` y `observaciones`; si
  faltan → `400` con `camposFaltantes` y la visita pasa a `incompleta`.
- **Examen (caso 15)**: al ordenarlo se congela su costo con RN-09
  (`precioBase`, `descuento`, `costo`); sin precio en el catálogo → `409`.
- **Prescripción (caso 18)**: `cantidadPrescrita` obligatoria; farmacia
  entrega por partes (`pendiente → parcial → dispensada`) y suma el costo
  a `visitas_medicas.costoFarmacia`.
- **Cierre (caso 19)**: en una transacción se cierra la visita y la
  solicitud y se genera el cargo al familiar (consulta según
  `tarifas_servicio` + laboratorio + farmacia, cada línea con RN-09) en
  `cargos_servicio` + `cargos_detalle`. Un solo cargo por visita (índice
  único); lo despachado después del cierre genera un cargo complementario.
- Estado inmutable una vez `completada` o `cancelada`.

**Tablas SQL Server añadidas a `AsiloCabezaAlgodon`** (bootstrap
idempotente al arrancar `pacientes-service`):

- `solicitudes_referencia` (id, idPaciente, idMedicoGeneral, especialidad,
  motivo, estado, fechaCita, horaCita, idMedicoEspecialista, fechaCreacion,
  fechaActualizacion) + índice `IX_solicitudes_paciente_especialidad_activa`
  usado por RN-02.
  Columna `idEnfermero` (caso 7).
- `visitas_medicas` (id, idSolicitudReferencia UNIQUE, idPaciente,
  idMedicoEspecialista, fecha, diagnostico, observaciones, estado,
  fechaCompletada, idFichaMedica, costoLaboratorio, costoFarmacia).
- `visita_examenes` (id, idVisita, tipo, estado `pendiente` → `disponible`
  cuando laboratorio registra el resultado, fechaSolicitud, precioBase,
  descuento, costo).
- `visita_prescripciones` (id, idVisita, medicamento, dosis, indicaciones,
  fechaPrescripcion, idMedicamento, estado `pendiente` → `parcial` →
  `dispensada`, cantidadPrescrita, cantidadEntregada, idDispensacion,
  fechaDispensacion). Las marca `farmacia-service` (RN-06).
- `familiares`, `fichas_medicas`, `avisos` (casos 5 y 12).

### 3.3 Roles

`ROLES_VALIDOS` en `auth-service`:
`enfermero, medico, medico_general, especialista, medico_especialista,
farmacia, laboratorio, admin, fundacion, coordinador_fundacion`.

RBAC por endpoint (aplicado con `autorizarRoles(...)`; el middleware es
una copia identica en cada servicio). Toda escritura exige rol; los
`GET` quedan abiertos a cualquier usuario autenticado salvo donde se
indica.

| Acción | Roles permitidos |
|---|---|
| `POST /api/auth/register` | `admin` |
| `POST /api/auth/cambiar-password` (propio usuario; contraseña de 8+ con letra y número, misma regla que alta y restablecimiento) | cualquier autenticado |
| `POST /api/auth/recuperar`, `POST /api/auth/restablecer` (RF-42, recuperación de contraseña) | sin sesión |
| Límite en `POST /api/auth/login` y `/recuperar` | 5 intentos fallidos por IP real + correo en 15 min → 429 (`LimitadorIntentos`, en memoria) |
| `POST /api/notificaciones/recuperacion` | solo el JWT de servicio de auth-service (rol `sistema`, no asignable a usuarios) |
| `GET /api/auth/usuarios[?rol=]` (directorio, sin passwordHash; solo activos) | `admin`, `coordinador_fundacion`, `medico_general` |
| `PUT /api/pacientes/:id/familiar` | `enfermero`, `admin` |
| `GET /api/avisos`, `PATCH /api/avisos/:id/leido` | cualquier autenticado, solo sus propios avisos |
| `POST /api/financiero/cargos/:id/abonos`, `POST /api/financiero/cuotas` | `admin` |
| `GET /api/financiero/alertas` | `admin`, `coordinador_fundacion`, `fundacion` |
| `PATCH /api/auth/usuarios/:id/{desactivar,reactivar}` | `admin` (no puede desactivarse a si mismo) |
| `POST`, `PUT /api/pacientes[/:id]` | `enfermero`, `admin` |
| `DELETE /api/pacientes/:id` (egreso: borrado lógico con `motivoEgreso` obligatorio y `fechaEgreso`), `PATCH /api/pacientes/:id/reactivar` | `admin` |
| `POST /api/solicitudes` | `medico_general` |
| `PATCH /api/solicitudes/:id/asignar-cita` | `coordinador_fundacion`, `admin` |
| `POST /api/solicitudes/:id/convertir-a-visita` | `medico_especialista` |
| `PATCH /api/solicitudes/:id/cancelar` | `medico_general`, `admin` |
| `PATCH /api/visitas/:id`, `POST /api/visitas/:id/{examenes,prescripciones,completar}` | `medico_especialista` |
| `POST`, `PUT`, `DELETE /api/farmacia/medicamentos[/:id]` (DELETE desactiva), `POST /api/farmacia/dispensaciones` | `farmacia`, `admin` |
| `PATCH /api/farmacia/medicamentos/:id/reactivar` | `admin` |
| `GET /api/laboratorio/ordenes-pendientes`, `GET .../pacientes/dpi/:dpi`, `POST .../resultados/examen/:id` | `laboratorio`, `admin` (también el `GET`) |
| `POST`, `PUT /api/laboratorio/precios[/:id]` | `admin` |
| `POST /api/financiero/{cargos,pagos-cuota,donantes,donaciones,gastos,pagos-fundacion}`, `PATCH /api/financiero/donantes/:id/{desactivar,reactivar}` | `admin` |
| `GET /api/auditoria` (reportes-service) | `admin` |
| `?incluirInactivos=true` en los listados de pacientes, usuarios, medicamentos y donantes | `admin` (403 para los demas) |
| `POST /api/notificaciones/:id/reintentar` | `admin` |
| Resto de lecturas (`GET`) | cualquier usuario autenticado |

La UI (`RBAC.tabs` + `RBAC.acciones` en `frontend/app.js`) oculta las
secciones y deshabilita los formularios según esta tabla; el backend es
la autoridad.

### 3.4 Borrado lógico y regla "paciente activo"

`pacientes`, `usuarios`, `medicamentos` y `donantes` tienen
`activo BIT NOT NULL DEFAULT 1` (`ALTER` idempotente; las filas
existentes quedan activas). No hay borrado físico en ninguna de las
cuatro: desactivar conserva el historial (solicitudes, visitas,
dispensaciones, donaciones, auditoría) y un administrador puede
reactivar.

- Los listados devuelven solo activos; `?incluirInactivos=true` es solo
  para `admin`. `GET /:id` sigue devolviendo el registro desactivado.
- **Paciente activo** (`pacientes-service/src/services/reglasPaciente.js`):
  un paciente desactivado no recibe solicitudes, asignación de cita,
  visitas, exámenes ni prescripciones → `409` con su nombre y la
  acción. `farmacia-service` aplica la misma regla al dispensar
  leyendo `pacientes.activo` en la BD compartida.
- Medicamento desactivado: sale del inventario y no se dispensa (409).
  Donante desactivado: no recibe donaciones (409).
- Cuenta desactivada: `POST /api/auth/login` responde `403`
  "Cuenta desactivada" (solo si la contraseña es correcta; si no, el
  `401` genérico). **Limitación:** un JWT ya emitido sigue siendo
  válido hasta su `exp` (8 h) en los demás servicios, que solo verifican
  la firma.

### 3.5 Auditoría

Tabla compartida `auditoria` (id, usuario = email del JWT, idUsuario,
accion, entidad, idEntidad, detalle, fecha UTC, `ip`, `modulo`,
`datosAnteriores` y `datosNuevos` en JSON — caso 24; nunca guarda
password, hash ni token). La IP es `req.ip`: el navegador llega por el
nginx del frontend (`/svc/<servicio>/`), que envía `X-Forwarded-For` y
`X-Real-IP`, y los cuatro servicios que auditan solo confían en ese nginx
(`trust proxy`, `middleware/confianzaProxy.js`). Así se guarda la IP del
cliente y un `X-Forwarded-For` mandado directo a un puerto se ignora. En
Docker Desktop el cliente del host aparece como 172.18.0.1; en el Debian es
la IP real del navegador. La crean al arrancar
auth, pacientes, farmacia y financiero (DDL idempotente que tolera la
carrera entre servicios) y la escriben desde sus controladores con
`AuditoriaService` (copia idéntica en los cuatro, como
`autorizarRoles`). Registrar nunca hace fallar la operación auditada.

| Servicio | Entidad | Acciones |
|---|---|---|
| auth | usuario | crear, desactivar, reactivar; modificar (recuperación de contraseña solicitada y contraseña restablecida) |
| pacientes | paciente | crear, modificar, desactivar (egreso, con fecha y motivo), reactivar |
| pacientes | solicitud | crear, modificar (asignar cita), cancelar |
| pacientes | visita / examen / prescripcion | crear (iniciar visita, pedir examen, prescribir), modificar (notas, completar) |
| farmacia | medicamento / dispensacion | crear, modificar, desactivar, reactivar / crear |
| pacientes | familiar | crear, modificar |
| financiero | cargo, abono, cuota, donante, donacion, gasto, pago_fundacion | crear; donante además desactivar y reactivar |

La lee `reportes-service` en `GET /api/auditoria?desde&hasta&entidad&idEntidad&limite`
(solo admin; `hasta` en YYYY-MM-DD incluye el día; también acepta
instantes ISO; límite 200 por defecto, 1000 máximo). Laboratorio y
notificaciones no registran auditoría.

---

## 4. Lenguajes y tecnologías (a nivel de sistema)

Stack realmente usado hoy en el repositorio:

| Categoría | Tecnología |
|---|---|
| Lenguaje de los 7 microservicios | **Node.js 20+ (Alpine en Docker)** |
| Framework HTTP | **Express 4** |
| Base de datos | **SQL Server 2022** (BD compartida `AsiloCabezaAlgodon`) |
| Cliente SQL | `mssql` (sin ORM; mapeo manual en la capa Repository) |
| Autenticación | JWT HS256 (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Correo transaccional | **Brevo** (`fetch` nativo contra `/v3/smtp/email`) |
| Reportes | **pdfkit** (PDF) + **exceljs** (Excel) |
| Frontend | HTML/CSS/JS plano servido por **nginx** 1.27 (sin build, sin frameworks) |
| Tipografías del frontend | Google Fonts: Libre Bodoni (títulos), Public Sans (cuerpo), IBM Plex Mono (cifras) — ver `design-system/asilo-cabeza-de-algodon/MASTER.md` |
| Pruebas automatizadas | **Jest 29 + Supertest 7** (ver [docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md)) |
| Contenedores / orquestación local | **Docker Compose** |
| Despliegue | Servidor Debian (Lenovo) accesible por Tailscale (`100.96.172.77`) y LAN (`192.168.1.100`) |
| Entorno de desarrollo | VS Code / Antigravity, Claude Code como asistente |
| Gestión del proyecto (SQA + planificación) | **ClickUp** |
| Modelado UML/ERD | Diagramas Mermaid en `docs/` (ERD, componentes) |

Decisiones arquitectónicas tomadas:
- **Un solo motor de BD** (SQL Server). Se evaluó database-per-service y
  se rechazó porque multiplicaba la complejidad operativa sin aportar
  aislamiento real al proyecto académico.
- **Comunicación entre microservicios: MIXTA.** No es "HTTP directo"
  uniforme. Hay dos canales deliberados, ver §4.1.
- **Mismo stack Node.js en todos los servicios** por mantenibilidad.

### 4.1 Comunicación entre microservicios (dos canales)

Al compartir una sola BD, la elección entre HTTP y lectura directa de
la BD depende de la naturaleza del evento, no de la ortodoxia de
microservicios:

| Canal | Cuándo se usa | Ejemplos reales |
|---|---|---|
| **HTTP + JWT** | Para efectos secundarios sin estado compartido: avisos, integraciones externas, operaciones idempotentes que puede ser retry-friendly. | `pacientes-service` → `POST /api/notificaciones/solicitud` (fire-and-forget al crear solicitud). `auth-service` → `POST /api/notificaciones/recuperacion` (JWT de servicio rol `sistema`, 1 min). `notificaciones-service` → Brevo. |
| **Lectura / escritura directa de la BD compartida** | Cuando el servicio B necesita leer y marcar un recurso que es parte del **agregado transaccional** de A, y una llamada HTTP solo introduciría coupling, latencia y modos de falla sin aportar nada. | `farmacia-service` lee y marca `visita_prescripciones` (RN-06, despacho parcial) y suma `visitas_medicas.costoFarmacia`. `laboratorio-service` lee y marca `visita_examenes`. `pacientes-service` escribe `cargos_servicio`/`cargos_detalle` al cerrar la visita (misma transacción) y lee `tarifas_servicio` y `examenes_precios`. `financiero-service` lee `familiares` (titular) y `pacientes` (alertas). `reportes-service` lee todas las tablas de dominio. |

Justificación de usar la BD como canal de integración en lugar de más
HTTP: (a) el agregado transaccional (prescripción, examen) **pertenece
a la visita médica**, no al servicio que lo despacha; su "ser válido"
y su "estar dispensado/entregado" son estados sobre la misma fila. (b)
Hay un solo modelo de datos, versionado por los `inicializarEsquema()`
de cada servicio con ALTER idempotente. (c) Los servicios pueden
arrancar **en cualquier orden**: ni laboratorio ni farmacia necesitan
que pacientes esté levantado para funcionar — basta la BD. (d) Si en
el futuro se separa la BD por microservicio, el paso natural es
reemplazar estas lecturas por HTTP; hasta entonces, es la decisión más
simple y la que menos acoplamiento operativo introduce.

Lo que **no** hacemos: API Gateway, service mesh, broker de eventos ni
schema registry. Están fuera del alcance del proyecto académico.

---

## 5. Estructura de carpetas actual del repositorio

```
Proyecto-AS-2/
├── auth-service/              # Puerto 3000 — JWT + RBAC
├── pacientes-service/         # Puerto 3002 — Paciente, Solicitud, Visita
├── farmacia-service/          # Puerto 3001 — Inventario + Dispensación (RN-06, RN-09)
├── laboratorio-service/       # Puerto 3003 — Órdenes y resultados (RN-09)
├── financiero-service/        # Puerto 3004 — Cuentas, cuotas, donaciones, gastos
├── reportes-service/          # Puerto 3005 — 7 reportes (PDF/Excel/JSON)
├── notificaciones-service/    # Puerto 3006 — Brevo + reintentos
├── frontend/                  # Puerto 8090 — HTML/CSS/JS por nginx
├── infra/                     # SQL de bootstrap (crear BD compartida)
├── scripts/                   # run-all-tests.sh, run-all-tests.ps1, seed-demo.js
├── docs/                      # PLAN_PRUEBAS.md, ERD.mmd, COMPONENTES.mmd, MANUAL_USUARIO.md
├── docker-compose.yml         # 7 servicios + SQL Server + db-init + nginx
├── .env.example               # Credenciales y configuración (NO versionada)
├── package.json               # Monorepo-lite: solo scripts (test:todo, seed:demo) + jest
├── CLAUDE.md                  # Resumen operativo para Claude Code
└── CONTEXT_SISTEMA.md         # Este archivo
```

Cada servicio tiene la **misma estructura interna de 4 capas**:

```
<servicio>/
├── src/
│   ├── app.js                  # Ensamblado (DI manual)
│   ├── controllers/            # Presentación
│   ├── routes/                 # Presentación (endpoints)
│   ├── services/               # Lógica de Negocio (RN-xx)
│   ├── repositories/           # Acceso a Datos
│   ├── models/                 # Entidades / Modelos
│   └── middleware/             # authMiddleware + autorizarRoles (copias idénticas)
├── __tests__/                  # Pruebas Jest (en los servicios con RN críticas)
├── package.json
├── Dockerfile
├── .env  / .env.example
└── README.md
```

---

## 6. Requisitos / features pendientes a nivel de sistema

### Documentación
- [x] Diagramas Mermaid: ERD (`docs/ERD.mmd`) y componentes (`docs/COMPONENTES.mmd`).
- [x] Plan de pruebas (`docs/PLAN_PRUEBAS.md`) con mapeo 1-a-1 a los tests.
- [x] Manual de usuario (`docs/MANUAL_USUARIO.md`) con huecos marcados para capturas.
- [ ] Planificación del proyecto en ClickUp (fuera del repo).
- [ ] Protocolo de versionado documentado en el repo (branches, PRs, revisión SQA).

### Desarrollo (módulos por construir)
- [x] Módulo de Pacientes / Ficha médica.
- [x] Módulo de Solicitudes a especialista + asignación de horario (fundación).
- [x] Módulo de Visita médica.
- [x] Autenticación/autorización unificada por roles (`auth-service/` con JWT + `autorizarRoles`).
- [x] Migrar Farmacia de SQLite a SQL Server (`AsiloCabezaAlgodon`).
- [x] Módulo de Laboratorio (`laboratorio-service/`, puerto 3003).
- [x] Módulo de Entradas, Salidas y Caja (`financiero-service/`, puerto 3004).
- [x] Módulo de Reportes con PDF/Excel (`reportes-service/`, puerto 3005).
- [x] Servicio de notificaciones por correo (`notificaciones-service/` con Brevo, puerto 3006).
- [x] Frontend con todas las pantallas del sistema.
- [x] Comunicación entre microservicios **mixta y documentada** (ver §4.1):
      HTTP + JWT para efectos secundarios (pacientes → notificaciones;
      notificaciones → Brevo), lectura/escritura directa de la BD
      compartida para los agregados transaccionales que viven en otra
      tabla (farmacia ↔ visita_prescripciones, laboratorio ↔
      visita_examenes, reportes lee todo).
- [x] Conectar prescripciones de visita a `farmacia-service` (RN-06:
      `idMedicamento` + estado `dispensada`, descuenta inventario).
- [x] Reintentos automáticos para notificaciones fallidas (job interno
      con espera creciente y estado `fallida_definitiva`).
- [x] Catálogo de precios de exámenes administrable (`/api/laboratorio/precios`, solo admin escribe).
- [x] Borrado lógico (`activo`) en pacientes, usuarios, medicamentos y
      donantes, y regla "paciente activo" (§3.4).
- [x] Auditoría mínima con consulta para el admin (§3.5).
- [x] Cierre de sesión por inactividad en el frontend (30 min, aviso 60 s antes).
- [x] Verificación contra el plan oficial del SQA (21 oct 2026): 25 casos,
      resultado en [docs/RESULTADOS_PLAN_SQA.csv](docs/RESULTADOS_PLAN_SQA.csv)
      y equivalencias de nombres en [docs/EQUIVALENCIAS.md](docs/EQUIVALENCIAS.md).
- [x] Alertas de cobro naranja / roja (saldo y cuotas vencidas) en el panel.
- [x] Prueba de carga versionada (`npm run test:carga`, < 3 s con 50 usuarios).
- [ ] Probar Brevo real (caso 10 solo en simulación; caso 11 verificado en vivo con la URL inalcanzable).
- [x] Egreso con fecha y motivo (caso 6).
- [x] IP real del cliente en la auditoría vía nginx (caso 24).
- [x] Recuperación de contraseña (RF-42, UC-10.4).
- Desviaciones respecto al Análisis: ver la sección del mismo nombre en `CLAUDE.md`.

### Endpoints internos (para referencia rápida)

| Servicio | Puerto | Prefijo |
|---|---|---|
| auth-service | 3000 | `/api/auth/*` |
| farmacia-service | 3001 | `/api/farmacia/*` |
| pacientes-service | 3002 | `/api/pacientes`, `/api/solicitudes`, `/api/visitas`, `/api/avisos` |
| laboratorio-service | 3003 | `/api/laboratorio/*` |
| financiero-service | 3004 | `/api/financiero/*` |
| reportes-service | 3005 | `/api/reportes/*`, `/api/auditoria` |
| notificaciones-service | 3006 | `/api/notificaciones/*` |
| frontend (nginx) | 8090 | HTML estático y proxy `/svc/<servicio>/` hacia los 7 servicios |

### Tablas nuevas agregadas en esta ronda

- `resultados_examenes`, `examenes_precios` (laboratorio).
- `cargos_servicio`, `cuotas_mensuales`, `donantes`, `donaciones`,
  `gastos_operativos`, `pagos_fundacion` (financiero).
- `notificaciones` (notificaciones).
- Columna `familiarEmail` en `pacientes` (bootstrap con `ALTER TABLE`
  idempotente para no romper datos existentes).
- Columna `activo` en `pacientes`, `usuarios`, `medicamentos` y
  `donantes`; tabla compartida `auditoria` (20 oct 2026).
- Ronda SQA (21 oct 2026): `familiares`, `fichas_medicas`, `avisos`
  (pacientes); `cargos_detalle`, `abonos_cargo`, `tarifas_servicio`
  (financiero); columnas nuevas en `cargos_servicio`, `cuotas_mensuales`,
  `visitas_medicas`, `visita_examenes`, `visita_prescripciones`,
  `dispensaciones`, `solicitudes_referencia`, `notificaciones` y
  `auditoria` (detalle en [docs/ERD.mmd](docs/ERD.mmd)). Todas con DDL
  idempotente; verificado arrancando desde una BD vacía.
- Ronda de cierre (23 oct 2026): `tokens_recuperacion` (auth; solo el
  hash SHA-256 del token) y `pacientes.fechaEgreso`/`motivoEgreso`.

### Infraestructura
- [x] Docker Desktop funcionando en la máquina de desarrollo (WSL2).
- [ ] Definir despliegue en Azure (Container Instance vs. AKS/Kubernetes).
- [ ] Manifiestos de Kubernetes si se usa AKS.
