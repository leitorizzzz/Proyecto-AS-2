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

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/health` | Estado + `modoSimulacion` |
| POST | `/api/notificaciones/solicitud` | Envia correo por solicitud creada |
| GET | `/api/notificaciones` | Log (ultimas 50 por defecto) |

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

## Integracion con pacientes-service

`pacientes-service` llama a `POST /api/notificaciones/solicitud` en modo
fire-and-forget al crear una solicitud. Si esta llamada falla o el
servicio esta caido, no bloquea la creacion de la solicitud — la
notificacion queda como `fallida` en la tabla `notificaciones` y puede
reintentarse.
