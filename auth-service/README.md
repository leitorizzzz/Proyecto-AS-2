# Microservicio de Autenticacion — Asilo Cabeza de Algodon

Autenticacion centralizada del sistema. Emite JWT (HS256) que validan
`pacientes-service`, `farmacia-service`, `laboratorio-service`,
`financiero-service`, `reportes-service` y `notificaciones-service`.

## Arquitectura interna (4 capas)

```
src/
├── controllers/   -> Presentacion (API REST)         AuthController
├── routes/        -> Presentacion (endpoints)         authRoutes
├── services/      -> Logica de Negocio (hash, JWT)   AuthService
├── repositories/  -> Acceso a Datos (SQL Server)      UsuarioRepository · database
├── models/        -> Entidades / Modelos              Usuario
└── middleware/    -> authMiddleware · autorizarRoles
scripts/
└── seed-admin.js  -> crea el primer admin (ver abajo)
```

## Base de datos

- Motor: **SQL Server**, BD compartida **AsiloCabezaAlgodon**.
- Tabla propia: `usuarios` (id, nombre, email UNIQUE, passwordHash,
  rol, fechaRegistro).

## Endpoints

| Metodo | Ruta                        | Auth | Rol      | Descripcion                           |
|--------|-----------------------------|------|----------|---------------------------------------|
| GET    | `/health`                   | —    | —        | Estado del servicio                   |
| POST   | `/api/auth/register`        | JWT  | admin    | Crear usuario (admin se encarga)      |
| POST   | `/api/auth/login`           | —    | —        | Login → `{ token, usuario }`          |
| GET    | `/api/auth/me`              | JWT  | —        | Perfil del usuario autenticado        |
| GET    | `/api/auth/usuarios[?rol=a,b][&incluirInactivos=true]` | JWT | admin, coordinador_fundacion | Directorio sin `passwordHash`, solo cuentas activas, filtrable por uno o varios roles; rol desconocido → 400; `incluirInactivos` solo admin. Lo usa el dialogo "Asignar cita" para elegir especialista |
| PATCH  | `/api/auth/usuarios/:id/desactivar` | JWT | admin | Desactiva la cuenta (no la propia → 409). Su login responde 403 "Cuenta desactivada" |
| PATCH  | `/api/auth/usuarios/:id/reactivar` | JWT | admin | Reactiva la cuenta |
| POST   | `/api/auth/cambiar-password` | JWT | — | `{ passwordActual, passwordNueva }` del propio usuario. Actual incorrecta, nueva que no cumple la regla o igual a la actual → 400 |
| POST   | `/api/auth/recuperar`      | —    | —        | RF-42. `{ email }` → siempre el mismo 200, exista o no la cuenta. Si existe y está activa: token nuevo (vence en 30 min) y correo con el enlace por notificaciones-service. Correo mal formado → 400 |
| POST   | `/api/auth/restablecer`    | —    | —        | RF-42. `{ token, password }` → 200 y cambia la contraseña; token falso, usado o vencido → 400; contraseña que no cumple la regla del alta → 400 |

Columna `usuarios.activo` (BIT, default 1). Un JWT emitido antes de
desactivar la cuenta sigue siendo valido hasta su `exp`: los demas
servicios solo verifican la firma. El alta y la (des)activacion de
cuentas se registran en la tabla `auditoria`.

### Regla de contraseña (Análisis, RF-42)

`services/reglasPassword.js`, la única regla para el alta, el cambio y el
restablecimiento: mínimo 8 caracteres, al menos una letra y al menos un
número (máximo 72 bytes, el límite de bcrypt). Si no cumple, 400 con un
mensaje que dice todo lo que falta, por ejemplo *La contraseña debe tener
al menos 8 caracteres y al menos un número.*

### Recuperación de contraseña (RF-42, UC-10.4)

1. `POST /api/auth/recuperar` responde de inmediato con el mismo mensaje
   para cualquier correo bien formado; el resto ocurre después de
   responder, así ni el contenido ni el tiempo de respuesta revelan si la
   cuenta existe.
2. Si la cuenta existe y está activa: se genera un token de 32 bytes
   aleatorios (`crypto.randomBytes`, base64url); en `tokens_recuperacion`
   solo se guarda su **SHA-256**, con `expira` = ahora + 30 min. Los
   tokens anteriores sin usar de esa cuenta se invalidan.
3. El enlace `RECUPERACION_URL_BASE/#restablecer=<token>` va por
   notificaciones-service (`POST /api/notificaciones/recuperacion`, con un
   JWT de servicio de 1 minuto y rol `sistema`). En `MODO_SIMULACION=true`
   queda en el log con `idMensajeProveedor = sim-...`; la API del log
   nunca devuelve el cuerpo de estos correos.
4. `POST /api/auth/restablecer` valida la contraseña con la misma regla
   del alta (`reglasPassword.js`), comprueba el token y, en una
   transacción, lo marca usado (UPDATE condicional: un solo uso aunque
   lleguen dos peticiones) y cambia el `passwordHash`.
5. Auditoría (`entidad = usuario`, `accion = modificar`): "recuperacion de
   contrasena solicitada" y "contrasena restablecida con enlace de
   recuperacion", con la IP del cliente. Nunca se audita la contraseña ni
   el token.

Sin límite de solicitudes por correo o por IP (ver "Desviaciones" en
`CLAUDE.md`).

### Roles validos (10)

`enfermero`, `medico`, `medico_general`, `especialista`,
`medico_especialista`, `farmacia`, `laboratorio`, `admin`, `fundacion`,
`coordinador_fundacion`.

Los roles con sufijo (`_general`, `_especialista`, `coordinador_`) son
los que usa la nueva tabla RBAC del sistema (ver CONTEXT_SISTEMA.md
§3.3). Los nombres cortos permanecen por compatibilidad.

### Payload del JWT

```json
{ "sub": <id>, "email": "...", "rol": "...", "iat": ..., "exp": ... }
```

Firma HS256. `JWT_EXPIRES_IN` controla la duracion (default `8h`).

## Semilla del primer admin

Crear el primer usuario con rol admin (idempotente):

```bash
npm run seed
# Credenciales por defecto (configurables via ADMIN_EMAIL/ADMIN_PASSWORD):
#   admin@asilo.gt / Admin12345
```

Despues del primer login, `POST /api/auth/register` requiere token admin
para crear nuevos usuarios.

## Variables de entorno (`.env`)

Copiar `.env.example` a `.env`.

| Variable                  | Default              | Uso                                               |
|---------------------------|----------------------|---------------------------------------------------|
| `PORT`                    | 3000                 | Puerto HTTP                                       |
| `DB_SERVER`               | localhost            | Host de SQL Server                                |
| `DB_PORT`                 | 1433                 |                                                   |
| `DB_NAME`                 | AsiloCabezaAlgodon   |                                                   |
| `DB_USER` / `DB_PASSWORD` | sa / —               |                                                   |
| `DB_ENCRYPT`              | false                | TLS                                                |
| `DB_TRUST_SERVER_CERTIFICATE` | true             | self-signed en dev                                 |
| `JWT_SECRET`              | —                    | **Mismo valor en los 7 servicios**                |
| `JWT_EXPIRES_IN`          | 8h                   | Duracion del token (`8h`, `1d`, `30m`...)         |
| `NOTIFICACIONES_URL`      | —                    | URL de notificaciones-service (correo de recuperacion) |
| `RECUPERACION_URL_BASE`   | http://localhost:8090 | Origen del frontend para armar el enlace de recuperacion |
| `RECUPERACION_MINUTOS`    | 30                   | Vigencia del enlace de recuperacion               |
| `TRUST_PROXY_HOST`        | frontend             | Proxy de confianza para `req.ip` (caso 24)         |
| `HASH_HILOS`              | nucleos - 1 (1..8)   | Hilos para bcrypt (caso 25)                        |

## Correr localmente

```bash
npm install
npm start
# http://localhost:3000
```

Tambien disponible dentro de docker-compose (contenedor
`asilo-auth-service`).

## Ejemplos de uso

```bash
# Login (publico)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@asilo.gt","password":"Admin12345"}' | jq -r .token)

# Crear usuario (solo admin)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@asilo.gt","password":"Pass1234","rol":"enfermero"}'

# Perfil del usuario del token
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```
