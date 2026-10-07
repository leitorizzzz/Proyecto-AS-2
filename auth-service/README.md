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
