# Microservicio de Notificaciones — Asilo Cabeza de Algodon

Envio de correos automaticos al familiar del paciente cuando ocurre un
evento relevante (por ahora: creacion de solicitud de referencia).
Proveedor: **Brevo** (ex-Sendinblue) via su API transaccional
`POST /v3/smtp/email`.

## 4 capas
```
src/
├── controllers/  NotificacionesController
├── routes/       notificacionesRoutes
├── services/     NotificacionesService (plantillas, envio, tolerancia a fallos)
├── repositories/ NotificacionRepository · database
├── models/       Notificacion
└── middleware/   authMiddleware · autorizarRoles
```

## Modo simulacion

Con `MODO_SIMULACION=true` (o `BREVO_API_KEY` vacio) el servicio guarda
la notificacion como `enviada` sin llamar a Brevo. Util en dev/CI.

## Endpoints

| Metodo | Ruta | Rol | Descripcion |
|---|---|---|---|
| GET  | `/health` | — | Estado + `modoSimulacion` + `maxIntentos` |
| POST | `/api/notificaciones/solicitud` | autenticado | Envia correo por solicitud creada |
| GET  | `/api/notificaciones[?estado=&limit=]` | autenticado | Log (ultimas 50 por defecto, filtrable por estado) |
| GET  | `/api/notificaciones/:id` | autenticado | Detalle de una notificacion |
| POST | `/api/notificaciones/:id/reintentar` | admin | Reintento manual forzado |

Estados posibles: `pendiente`, `enviada`, `fallida`, `fallida_definitiva`.

Payload de `POST /api/notificaciones/solicitud`:

```json
{
  "idPaciente": 1,
  "pacienteNombre": "Juan Perez Lopez",
  "especialidad": "cardiologia",
  "motivo": "Dolor toracico recurrente",
  "familiarEmail": "familiar@example.com"
}
```

## Reintentos automaticos

El servicio corre un **job interno** (setInterval, sin dependencias
nuevas) que cada `NOTIF_INTERVALO_JOB_SEG` segundos busca
notificaciones en `pendiente` o `fallida` cuyo `proximoIntento` ya
llego y las reintenta. La espera entre intentos se duplica cada vez a
partir de `NOTIF_ESPERA_BASE_SEG` con tope en `NOTIF_ESPERA_MAX_SEG`.
Al alcanzar `NOTIF_MAX_INTENTOS` la notificacion queda en estado
`fallida_definitiva` (sin bucles infinitos).

Un reintento manual por admin reinicia el contador si estaba en
`fallida_definitiva`.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `PORT` | 3006 | HTTP |
| `DB_*` | — | SQL Server |
| `JWT_SECRET` | — | mismo valor que auth-service |
| `BREVO_API_KEY` | vacio | API key de Brevo; vacio = simulacion |
| `BREVO_API_URL` | https://api.brevo.com/v3/smtp/email | |
| `REMITENTE_EMAIL` | notificaciones@asilo.gt | From del correo |
| `REMITENTE_NOMBRE` | Asilo Cabeza de Algodon | From del correo |
| `MODO_SIMULACION` | true | Si true, no llama a Brevo |
| `NOTIF_MAX_INTENTOS` | 3 | Reintentos antes de marcar fallida_definitiva |
| `NOTIF_ESPERA_BASE_SEG` | 30 | Espera inicial entre intentos |
| `NOTIF_ESPERA_MAX_SEG` | 300 | Tope de la espera |
| `NOTIF_INTERVALO_JOB_SEG` | 30 | Frecuencia del job de reintentos |

## Integracion con pacientes-service

`pacientes-service` llama a `POST /api/notificaciones/solicitud` en modo
**fire-and-forget** al crear una solicitud. Si falla el envio o el
servicio esta caido, la solicitud se crea igual y la notificacion queda
en `fallida`; el job interno la reintentara automaticamente.
