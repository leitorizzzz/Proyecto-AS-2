# Microservicio de Farmacia — Asilo Cabeza de Algodon

Inventario de medicamentos y **dispensacion contra prescripcion** emitida
en una visita medica. Aplica el 20 % de descuento de la fundacion
(RN-09) y marca la prescripcion como `dispensada` para que no pueda
re-dispensarse.

## Arquitectura (4 capas)

```
src/
├── controllers/  FarmaciaController
├── routes/       farmaciaRoutes
├── services/     FarmaciaService      (RN-06 + RN-09 + stock)
├── repositories/ MedicamentoRepository · DispensacionRepository
│                 PrescripcionReadRepository (lee visita_prescripciones
│                 propiedad de pacientes-service, misma BD compartida)
├── models/       Medicamento · Dispensacion · Prescripcion
└── middleware/   authMiddleware · autorizarRoles
```

## Base de datos (`AsiloCabezaAlgodon`)

Tablas propias: `medicamentos`, `dispensaciones`. Lee + marca
`visita_prescripciones`.

## Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET  | `/health` | Estado |
| GET/POST/PUT/DELETE | `/api/farmacia/medicamentos[/:id]` | CRUD de inventario |
| GET  | `/api/farmacia/prescripciones/pendientes/paciente/:idPaciente` | Prescripciones pendientes del paciente |
| POST | `/api/farmacia/dispensaciones` | **Dispensar** (requiere idPrescripcion, cantidad) |
| GET  | `/api/farmacia/dispensaciones/paciente/:idPaciente` | Historial + total gastado |

### Reglas aplicadas al dispensar

- **RN-06**: la prescripcion debe existir, estar `pendiente`, tener
  `idMedicamento` asociado y pertenecer al mismo paciente. Si no, 400/404/409.
- **RN-09**: `costoTotal = precio * cantidad * (1 - DESCUENTO_FUNDACION)`.
- Stock insuficiente → 409 con mensaje "Stock insuficiente de X. Disponible: N".

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `PORT` | 3001 | HTTP |
| `DB_*` | — | SQL Server |
| `JWT_SECRET` | — | mismo valor que auth-service |

El porcentaje de descuento es constante en el servicio (0.20) alineado
con `laboratorio-service.DESCUENTO_FUNDACION`.

## Correr

```bash
npm install
npm start
# http://localhost:3001
```

## Flujo end-to-end

1. Medico especialista crea una prescripcion en una visita, eligiendo
   el medicamento del inventario (`idMedicamento`).
2. Farmacia consulta `/api/farmacia/prescripciones/pendientes/paciente/:id`.
3. Farmacia hace `POST /api/farmacia/dispensaciones` con
   `{ idPrescripcion, cantidad }`.
4. El servicio: descuenta stock, aplica descuento, graba la dispensacion
   y marca la prescripcion como dispensada.
5. Un segundo intento sobre la misma prescripcion devuelve 409.
