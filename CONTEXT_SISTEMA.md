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
| **Pacientes / Fichas médicas** | Registro de internos, historial médico, padecimientos | ✅ Dentro de `pacientes-service/` (dominio Paciente) |
| **Solicitudes a especialista** | Médico general refiere a especialidad; fundación asigna horario y médico | ✅ Dentro de `pacientes-service/` (dominio SolicitudReferencia) |
| **Visita médica** | Registro de fecha, motivo, médico, exámenes, diagnóstico, medicamento, observaciones | ✅ Dentro de `pacientes-service/` (dominio VisitaMedica) |
| **Laboratorio** | Recepción de órdenes, registro de resultados | ⏳ Pendiente (exámenes hoy se registran localmente en la visita, sin conexión al servicio) |
| **Farmacia** | Inventario y dispensación de medicamentos con descuento fundación | ✅ `farmacia-service/` (prescripciones hoy se registran localmente en la visita, sin conexión al servicio) |
| **Entradas, Salidas y Caja** | Donaciones, cobros a familiares, gastos, pagos a fundación | ⏳ Pendiente |
| **Reportes** | Costos por cita, análisis médicos, cobros por rango de fecha, pagos a fundación, entradas, exámenes, medicamentos aplicados | ⏳ Pendiente |
| **Notificaciones** | Correo automático al familiar cuando se crea una solicitud médica | ⏳ Pendiente |

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
- [x] Módulo de Pacientes / Ficha médica (dentro de `pacientes-service/`).
- [x] Módulo de Solicitudes a especialista + asignación de horario
      (fundación) (dentro de `pacientes-service/`).
- [x] Módulo de Visita médica (dentro de `pacientes-service/`).
- [x] Autenticación/autorización unificada por roles en todo el sistema
      (`auth-service/` con JWT + `autorizarRoles`).
- [x] Migrar Farmacia de SQLite a la base de datos definitiva
      (SQL Server en `AsiloCabezaAlgodon`).
- [ ] Módulo de Laboratorio (hoy: exámenes se registran locales en visita).
- [ ] Conectar prescripciones de visita a `farmacia-service`
      (hoy: registro local dentro de la visita).
- [ ] Módulo de Entradas, Salidas y Caja (donaciones, cobros, gastos).
- [ ] Módulo de Reportes (los 7 reportes listados en el enunciado).
- [ ] Servicio de notificaciones por correo a familiares.
- [ ] Definir cómo se comunican los microservicios entre sí (API Gateway,
      llamadas directas, cola de mensajes, etc.) — aún no decidido.

### Infraestructura
- [ ] Resolver instalación de Docker Desktop en la máquina de desarrollo
      (en progreso — conflicto de virtualización con VMware).
- [ ] Definir despliegue en Azure (Container Instance vs. AKS/Kubernetes).
- [ ] Manifiestos de Kubernetes si se usa AKS.
