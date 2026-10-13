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

## Probar Brevo real (`MODO_SIMULACION=false`) en 5 pasos

> Procedimiento escrito pero **todavia no ejecutado** contra Brevo: hasta
> ahora el servicio solo se ha probado en modo simulacion. Hazlo una vez
> antes de la demo y anota aqui el resultado.

**1. Preparar la cuenta de Brevo.** En <https://app.brevo.com>:

- *Senders, Domains & Dedicated IPs → Senders*: agrega y **verifica** el
  correo que usaras como remitente (Brevo manda un enlace de
  confirmacion a esa casilla). El default `notificaciones@asilo.gt` no
  es un buzon real: sin un remitente verificado Brevo rechaza el envio.
- *SMTP & API → API Keys*: genera una key v3 (empieza con `xkeysib-`).
  Se muestra una sola vez.

**2. Configurar las variables** en el `.env` de la raiz del repo (el
mismo que lee `docker-compose.yml`; no se versiona):

```
BREVO_API_KEY=xkeysib-...            # la key del paso 1
REMITENTE_EMAIL=tu-remitente@dominio # exactamente el remitente verificado
MODO_SIMULACION=false
```

`REMITENTE_NOMBRE` y `BREVO_API_URL` estan fijos en `docker-compose.yml`
y no hace falta tocarlos.

**3. Recrear solo este servicio y confirmar el modo.**

```bash
docker compose up -d --force-recreate notificaciones-service
curl http://localhost:3006/health        # debe decir "modoSimulacion": false
```

Ojo: `/health` solo refleja `MODO_SIMULACION`. Si `BREVO_API_KEY` quedo
vacia el servicio **sigue simulando** aunque `/health` diga `false`
(ver `intentarEnvio` en `NotificacionesService`). Confirma que la key
llego al contenedor sin imprimirla:

```bash
docker compose exec notificaciones-service sh -c 'test -n "$BREVO_API_KEY" && echo "key presente"'
```

**4. Disparar un correo de prueba** a una casilla tuya:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@asilo.gt","password":"<password del admin>"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

curl -s -X POST http://localhost:3006/api/notificaciones/solicitud \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"idPaciente":1,"pacienteNombre":"Prueba Brevo","especialidad":"cardiologia","motivo":"Prueba de envio real","familiarEmail":"tu-correo@gmail.com"}'
```

La respuesta trae el `id` y el `estado`. Tambien sirve el camino
completo: crear una solicitud desde el frontend para un paciente cuyo
**Correo del familiar** sea tu casilla.

**5. Comprobar que el correo salio y llego.**

- Respuesta del paso 4 con `"estado": "enviada"` = Brevo acepto el
  mensaje (HTTP 2xx). No garantiza la entrega.
- Bandeja de entrada (y spam) de la casilla destino: asunto *"Se ha
  registrado una solicitud medica para Prueba Brevo"*.
- En Brevo, *Transactional → Logs*: el evento debe pasar de *Sent* a
  *Delivered*.
- Si quedo en `fallida`, el motivo esta en el log del servicio:

  ```bash
  curl -s "http://localhost:3006/api/notificaciones?estado=fallida&limit=5" \
    -H "Authorization: Bearer $TOKEN"
  ```

  | `mensajeError` | Causa habitual |
  |---|---|
  | `Brevo respondio 401` | Key mal copiada, revocada o con espacios. |
  | `Brevo respondio 400` + *sender* | `REMITENTE_EMAIL` no coincide con un remitente verificado. |
  | `Brevo respondio 401` + *unrecognised IP* | La cuenta restringe IPs: autoriza la IP publica del servidor en *Security → Authorised IPs*. |
  | `fetch failed` | El contenedor no tiene salida a internet / DNS. |

  El job reintenta solo cada `NOTIF_INTERVALO_JOB_SEG`; tras corregir la
  causa, un admin puede forzarlo con
  `POST /api/notificaciones/:id/reintentar`.

Al terminar, vuelve a `MODO_SIMULACION=true` en los entornos donde corran
`npm run seed:demo` o `npm run test:e2e`: ambos crean solicitudes y en
modo real enviarian correos a las direcciones de ejemplo, gastando la
cuota diaria del plan gratuito.

## Integracion con pacientes-service

`pacientes-service` llama a `POST /api/notificaciones/solicitud` en modo
**fire-and-forget** al crear una solicitud. Si falla el envio o el
servicio esta caido, la solicitud se crea igual y la notificacion queda
en `fallida`; el job interno la reintentara automaticamente.
