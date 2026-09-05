# Microservicio de Pacientes — Asilo Cabeza de Algodon

Microservicio para el registro y gestion de **pacientes (internos)** del asilo.
CRUD completo protegido por JWT emitido por `auth-service`.

## Arquitectura interna (4 capas)

```
src/
├── controllers/   -> Capa de Presentacion (API REST)
├── routes/        -> Capa de Presentacion (definicion de endpoints)
├── services/      -> Capa de Logica de Negocio (validaciones)
├── repositories/  -> Capa de Acceso a Datos (SQL Server)
├── models/        -> Capa de Entidades / Modelos
└── middleware/    -> authMiddleware.js (copia del auth-service)
```

## Base de datos

- Motor: **SQL Server**
- BD compartida: **AsiloCabezaAlgodon**
- Tabla propia: `pacientes`

## Endpoints

Todos requieren `Authorization: Bearer <token>` emitido por `auth-service`.

| Metodo | Ruta                  | Descripcion                    |
|--------|-----------------------|--------------------------------|
| GET    | `/health`             | Estado del servicio (publico)  |
| GET    | `/api/pacientes`      | Listar todos los pacientes     |
| GET    | `/api/pacientes/:id`  | Obtener un paciente            |
| POST   | `/api/pacientes`      | Registrar paciente nuevo       |
| PUT    | `/api/pacientes/:id`  | Actualizar paciente            |
| DELETE | `/api/pacientes/:id`  | Eliminar paciente              |

### Campos del paciente
`nombres`, `apellidos`, `fechaNacimiento` (YYYY-MM-DD), `genero` (`M`|`F`|`Otro`),
`dpi` (13 digitos, unico), `direccion`, `telefono`, `contactoEmergencia`,
`padecimientos`, `fechaIngreso` (auto).

## Configuracion (`.env`)

Copiar `.env.example` a `.env`. Ver `DB_*` y **`JWT_SECRET`** — este ultimo
debe ser identico al del `auth-service`.

## Como correrlo

```bash
npm install
npm start
# http://localhost:3002
```

## Ejemplo

```bash
TOKEN=<obtenido de POST /api/auth/login>

curl -X POST http://localhost:3002/api/pacientes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nombres":"Juan",
    "apellidos":"Perez Lopez",
    "fechaNacimiento":"1945-06-12",
    "genero":"M",
    "dpi":"2589631470101",
    "direccion":"Aldea San Jose, Mazatenango",
    "telefono":"55551234",
    "contactoEmergencia":"Maria Perez (hija) - 55559999",
    "padecimientos":"Hipertension, artritis"
  }'
```
