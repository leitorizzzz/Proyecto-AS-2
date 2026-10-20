# Microservicio de Laboratorio — Asilo Cabeza de Algodon

Recepcion de ordenes de examen (originadas en `pacientes-service` durante
una visita medica) y registro de resultados. Al registrar un resultado, la
orden en `visita_examenes` pasa a `disponible`.

## 4 capas
```
src/
├── controllers/  LaboratorioController
├── routes/       laboratorioRoutes
├── services/     LaboratorioService
├── repositories/ ResultadoExamenRepository · PacienteReadRepository · database
├── models/       ResultadoExamen
└── middleware/   authMiddleware · autorizarRoles
```

## Base de datos

- BD compartida: `AsiloCabezaAlgodon` (SQL Server).
- Tablas propias: `resultados_examenes`, `examenes_precios`.
- Tablas leidas / actualizadas de otros dominios (misma BD):
  `visita_examenes`, `visitas_medicas`, `pacientes`.

## Endpoints

Todos requieren JWT emitido por `auth-service` (salvo `/health`).

| Metodo | Ruta | Rol | Descripcion |
|---|---|---|---|
| GET | `/health` | — | Estado del servicio |
| GET | `/api/laboratorio/ordenes-pendientes` | laboratorio, admin | Examenes sin resultado |
| GET | `/api/laboratorio/pacientes/dpi/:dpi` | laboratorio, admin | Identificar paciente |
| POST | `/api/laboratorio/resultados/examen/:idExamen` | laboratorio, admin | Registrar resultado |
| GET | `/api/laboratorio/resultados/examen/:idExamen` | autenticado | Consultar resultado |
| GET | `/api/laboratorio/examenes/:idExamen/costo` | autenticado | Costo con descuento fundacion |
| GET | `/api/laboratorio/precios` | autenticado | Catalogo de precios; cada item trae `precioBase`, `porcentajeDescuento` y `precioConDescuento` (RN-09) |
| POST | `/api/laboratorio/precios` | admin | Alta `{ tipo, precioBase }`; tipo repetido → 409 |
| PUT | `/api/laboratorio/precios/:id` | admin | Cambiar `tipo` y/o `precioBase` |

El costo de un examen se busca por coincidencia exacta entre el `tipo`
del examen pedido en la visita y el `tipo` del catalogo; si no hay
precio, `/costo` responde 404. El frontend sugiere los tipos del
catalogo al pedir el examen para evitarlo.

## Reglas de negocio

- **RN-09**: descuento de fundacion aplicado (por defecto 20%,
  configurable via `DESCUENTO_FUNDACION`).
- Un examen solo puede tener un resultado; segundo intento → 409.
- El tipo del resultado (`texto`, `numerico`, `archivo`, `mixto`)
  determina cuales campos son obligatorios.
