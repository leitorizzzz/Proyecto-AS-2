# Microservicio de Pacientes — Asilo Cabeza de Algodon

Pacientes del asilo + dos dominios acoplados a su agregado transaccional:
**Solicitudes de referencia a especialista** y **Visitas medicas** (con
diagnostico, examenes y prescripciones). Protegido por JWT.

Al crear una solicitud, invoca a `notificaciones-service` en modo
fire-and-forget para enviar el correo al familiar.

## Arquitectura interna (4 capas, 3 dominios)

```
src/
├── controllers/   PacienteController · SolicitudController · VisitaMedicaController
├── routes/        pacientesRoutes    · solicitudRoutes     · visitaMedicaRoutes
├── services/      PacienteService    · SolicitudService    · VisitaMedicaService
│                  + NotificacionesClient (HTTP a notificaciones-service)
├── repositories/  PacienteRepository · SolicitudRepository · VisitaMedicaRepository · database
├── models/        Paciente · SolicitudReferencia · VisitaMedica
└── middleware/    authMiddleware · autorizarRoles
```

## Base de datos (compartida AsiloCabezaAlgodon)

Tablas propias (bootstrap idempotente al arrancar):
- `pacientes` (id, nombres, apellidos, fechaNacimiento, genero, dpi UNIQUE,
  direccion, telefono, contactoEmergencia, familiarEmail, padecimientos,
  fechaIngreso).
- `solicitudes_referencia` (id, idPaciente, idMedicoGeneral, especialidad,
  motivo, estado, fechaCita, horaCita, idMedicoEspecialista,
  fechaCreacion, fechaActualizacion).
- `visitas_medicas` (id, idSolicitudReferencia UNIQUE, idPaciente,
  idMedicoEspecialista, fecha, diagnostico, observaciones, estado,
  fechaCompletada).
- `visita_examenes` (id, idVisita, tipo, estado, fechaSolicitud) — lee
  tambien laboratorio-service.
- `visita_prescripciones` (id, idVisita, medicamento, dosis, indicaciones,
  idMedicamento, estado, idDispensacion, fechaDispensacion,
  fechaPrescripcion) — lee tambien farmacia-service para RN-06.

## Endpoints

Todos requieren JWT. RBAC resumida (completa en CONTEXT_SISTEMA.md §3.3):

| Metodo | Ruta | Rol |
|---|---|---|
| GET    | `/health` | publico |
| GET/POST/PUT/DELETE | `/api/pacientes[...]` | autenticado para leer, admin / enfermero para escribir |
| POST   | `/api/solicitudes` | medico_general |
| GET    | `/api/solicitudes[/:id\|/paciente/:id]` | autenticado |
| PATCH  | `/api/solicitudes/:id/asignar-cita` | coordinador_fundacion, admin |
| POST   | `/api/solicitudes/:id/convertir-a-visita` | medico_especialista |
| PATCH  | `/api/solicitudes/:id/cancelar` | medico_general, admin |
| GET    | `/api/visitas/:id`, `/api/visitas/paciente/:id` | autenticado |
| PATCH  | `/api/visitas/:id` | medico_especialista |
| POST   | `/api/visitas/:id/examenes` | medico_especialista |
| POST   | `/api/visitas/:id/prescripciones` | medico_especialista |
| POST   | `/api/visitas/:id/completar` | medico_especialista |

## Reglas de negocio implementadas

- **RN-02**: una solicitud activa por paciente+especialidad → duplicado 409.
- Completar visita exige `diagnostico` y `observaciones` → 400 si faltan.
- Estado inmutable tras `completada`/`cancelada`.
- Al completar la visita, la solicitud enlazada pasa a `completada`.
- La prescripcion lleva `idMedicamento` + `estado` (`pendiente`/`dispensada`)
  para que farmacia pueda validar **RN-06** antes de despachar.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `PORT` | 3002 | HTTP |
| `DB_*` | — | SQL Server (ver `.env.example`) |
| `JWT_SECRET` | — | mismo valor que auth-service |
| `NOTIFICACIONES_URL` | — | ej. `http://notificaciones-service:3006`. Vacio deshabilita el envio del correo. |

## Correr

```bash
npm install
npm start
# http://localhost:3002
```

Ejemplo de creacion de solicitud (dispara correo al familiar):

```bash
TOKEN_MG=... # token de un usuario con rol medico_general
curl -X POST http://localhost:3002/api/solicitudes \
  -H "Authorization: Bearer $TOKEN_MG" \
  -H "Content-Type: application/json" \
  -d '{"idPaciente":1,"especialidad":"cardiologia","motivo":"Dolor toracico"}'
```
