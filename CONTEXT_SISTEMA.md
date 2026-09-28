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
| **Frontend** | Login + Dashboard + 7 pantallas (Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Financiero, Reportes) | ✅ `frontend/` (nginx, HTML/CSS/JS plano) |

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
                                                                                                        │
                                                                                                        ▼
                                                                                                    completada
Cancelación (medico_general | admin) desde cualquier estado previo a completada → cancelada.
```

**Reglas de negocio implementadas:**

- **RN-02**: Un paciente no puede tener dos solicitudes activas
  (`pendiente_asignacion`, `cita_asignada`, `en_atencion`) para la misma
  especialidad simultáneamente. Duplicado → `409`.
- Completar visita exige `diagnostico` y `observaciones` no vacíos → `400` si faltan.
- Al completar la visita, la solicitud enlazada se marca `completada`.
- Estado inmutable una vez `completada` o `cancelada`.

**Tablas SQL Server añadidas a `AsiloCabezaAlgodon`** (bootstrap
idempotente al arrancar `pacientes-service`):

- `solicitudes_referencia` (id, idPaciente, idMedicoGeneral, especialidad,
  motivo, estado, fechaCita, horaCita, idMedicoEspecialista, fechaCreacion,
  fechaActualizacion) + índice `IX_solicitudes_paciente_especialidad_activa`
  usado por RN-02.
- `visitas_medicas` (id, idSolicitudReferencia UNIQUE, idPaciente,
  idMedicoEspecialista, fecha, diagnostico, observaciones, estado,
  fechaCompletada).
- `visita_examenes` (id, idVisita, tipo, estado='pendiente', fechaSolicitud).
- `visita_prescripciones` (id, idVisita, medicamento, dosis, indicaciones,
  fechaPrescripcion).

### 3.3 Roles

`ROLES_VALIDOS` en `auth-service`:
`enfermero, medico, medico_general, especialista, medico_especialista,
farmacia, laboratorio, admin, fundacion, coordinador_fundacion`.

RBAC por endpoint (aplicado con `autorizarRoles(...)`):

| Acción | Roles permitidos |
|---|---|
| `POST /api/solicitudes` | `medico_general` |
| `PATCH /api/solicitudes/:id/asignar-cita` | `coordinador_fundacion`, `admin` |
| `POST /api/solicitudes/:id/convertir-a-visita` | `medico_especialista` |
| `PATCH /api/solicitudes/:id/cancelar` | `medico_general`, `admin` |
| `PATCH /api/visitas/:id`, `POST /api/visitas/:id/{examenes,prescripciones,completar}` | `medico_especialista` |
| Listar / obtener (`GET`) | cualquier usuario autenticado |

---

## 4. Lenguajes y tecnologías (a nivel de sistema)

| Categoría | Definido / usado |
|---|---|
| Base de datos objetivo (producción) | MySQL, SQL Server u Oracle (requerido por el enunciado) |
| Microservicio de Farmacia (actual) | Node.js + Express + SQLite (demo) |
| Contenedores | Docker (Dockerfile ya creado para Farmacia) |
| Orquestación (pendiente de explorar) | Kubernetes / Azure Container Instances |
| Entorno de desarrollo | Antigravity (fork de VS Code), Claude Code como asistente |
| Modelado UML/ERD | Pendiente de herramienta a definir |
| Planificación | Microsoft Project (requerido por el enunciado, trabajar junto a SQA) |

No hay un stack único obligatorio para todos los módulos — cada
microservicio individual puede usar la tecnología que el estudiante
prefiera (Node.js, Java Spring, Python, .NET), siempre que se comunique con
los demás y respete las 4 capas.

---

## 5. Estructura de carpetas actual del repositorio

Por ahora solo existe el microservicio de Farmacia como código real; el
resto del sistema aún es documentación.

```
proyecto/
├── farmacia-service/          # Microservicio funcional (Node.js/Express/SQLite)
│   ├── src/
│   │   ├── app.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── models/
│   ├── public/                # Frontend de prueba
│   ├── Dockerfile
│   ├── CONTEXT.md             # Contexto específico de este microservicio
│   └── README.md
├── documentacion/
│   ├── Arquitectura_Asilo_Cabeza_Algodonn.docx / .pdf
│   ├── Estructura_Capas_Proyecto.docx / .pdf
│   └── (UX/UI login: v1, v2, wireframe, PPTX)
└── (módulos pendientes: pacientes, laboratorio, financiero, reportes, notificaciones)
```

> Sugerencia: a medida que se construyan más microservicios, cada uno debería
> vivir en su propia carpeta al mismo nivel que `farmacia-service/`, cada uno
> con su propio `README.md` y `Dockerfile`, para poder desplegarse de forma
> independiente.

---

## 6. Requisitos / features pendientes a nivel de sistema

### Documentación (fases del proyecto, según fechas de entrega)
- [ ] Fase de Análisis: estudio de factibilidad, análisis de requerimientos,
      diagramas UML completos, ERD.
- [ ] Planificación real del proyecto en Microsoft Project (junto a SQA).
- [ ] Prototipo de interfaz completo (ya se avanzó con el login; faltan las
      demás pantallas).
- [ ] Documentación de componentes de software basada en clases.
- [ ] Plan de pruebas (junto a SQA).
- [ ] Manual de usuario (con modelo E-R y diagrama de componentes).
- [ ] Definir protocolo de versionado (GitHub u otro) — **recordar que el
      enunciado prohíbe entregar ZIP/RAR en la entrega final**, solo se
      acepta URL de repositorio.

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
- [x] Comunicación entre microservicios: HTTP directo llamando por nombre
      de contenedor (`http://notificaciones-service:3006`, etc.). No hay
      API Gateway ni cola de mensajes; el patrón acordado es el más simple
      dado el estado actual del proyecto.
- [ ] Conectar prescripciones de visita a `farmacia-service` (hoy sólo
      registro local en `visita_prescripciones` sin descontar inventario).
- [ ] Reintentos automáticos para notificaciones fallidas (hoy: fire-and-forget).

### Endpoints internos (para referencia rápida)

| Servicio | Puerto | Prefijo |
|---|---|---|
| auth-service | 3000 | `/api/auth/*` |
| farmacia-service | 3001 | `/api/farmacia/*` |
| pacientes-service | 3002 | `/api/pacientes`, `/api/solicitudes`, `/api/visitas` |
| laboratorio-service | 3003 | `/api/laboratorio/*` |
| financiero-service | 3004 | `/api/financiero/*` |
| reportes-service | 3005 | `/api/reportes/*` |
| notificaciones-service | 3006 | `/api/notificaciones/*` |
| frontend (nginx) | 8090 | HTML estático |

### Tablas nuevas agregadas en esta ronda

- `resultados_examenes`, `examenes_precios` (laboratorio).
- `cargos_servicio`, `cuotas_mensuales`, `donantes`, `donaciones`,
  `gastos_operativos`, `pagos_fundacion` (financiero).
- `notificaciones` (notificaciones).
- Columna `familiarEmail` en `pacientes` (bootstrap con `ALTER TABLE`
  idempotente para no romper datos existentes).

### Infraestructura
- [ ] Resolver instalación de Docker Desktop en la máquina de desarrollo
      (en progreso — conflicto de virtualización con VMware).
- [ ] Definir despliegue en Azure (Container Instance vs. AKS/Kubernetes).
- [ ] Manifiestos de Kubernetes si se usa AKS.
