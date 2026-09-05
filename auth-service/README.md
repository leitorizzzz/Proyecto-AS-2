# Microservicio de Autenticacion — Asilo Cabeza de Algodon

Microservicio centralizado de autenticacion para el sistema. Emite y valida
**JSON Web Tokens (JWT)** que consumen los demas microservicios
(`farmacia-service`, `pacientes-service`, etc.).

## Arquitectura interna (4 capas)

```
src/
├── controllers/   -> Capa de Presentacion (API REST)
├── routes/        -> Capa de Presentacion (definicion de endpoints)
├── services/      -> Capa de Logica de Negocio (hash, JWT, validaciones)
├── repositories/  -> Capa de Acceso a Datos (SQL Server)
├── models/        -> Capa de Entidades / Modelos
└── middleware/    -> Middleware compartido (authMiddleware.js)
```

## Base de datos

- Motor: **SQL Server**
- BD compartida: **AsiloCabezaAlgodon**
- Tabla propia: `usuarios` (id, nombre, email, passwordHash, rol, fechaRegistro)

## Endpoints

| Metodo | Ruta                | Auth  | Descripcion                       |
|--------|---------------------|-------|-----------------------------------|
| GET    | `/health`           | -     | Estado del servicio               |
| POST   | `/api/auth/register`| -     | Registrar nuevo usuario           |
| POST   | `/api/auth/login`   | -     | Login → devuelve `{ token, usuario }` |
| GET    | `/api/auth/me`      | JWT   | Perfil del usuario autenticado    |

### Roles validos
`enfermero`, `medico`, `especialista`, `farmacia`, `laboratorio`, `admin`, `fundacion`.

### Payload del JWT
```json
{ "sub": <id>, "email": "...", "rol": "...", "iat": ..., "exp": ... }
```

Firma: HS256, expiracion configurable via `JWT_EXPIRES_IN` (default `8h`).

## Configuracion (`.env`)

Copiar `.env.example` a `.env` y ajustar valores.

Variables clave:
- `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT`,
  `DB_TRUST_SERVER_CERTIFICATE`
- `JWT_SECRET` — **debe ser identico** al de `farmacia-service` y
  `pacientes-service` para que puedan validar los tokens emitidos aqui.
- `JWT_EXPIRES_IN` — duracion del token (`8h`, `1d`, etc).

## Como correrlo

```bash
npm install
npm start
# http://localhost:3000
```

## Ejemplos

```bash
# Registro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@asilo.gt","password":"secret1","rol":"enfermero"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@asilo.gt","password":"secret1"}'

# Perfil (con token del login)
curl http://localhost:3000/api/auth/me -H "Authorization: Bearer <TOKEN>"
```
