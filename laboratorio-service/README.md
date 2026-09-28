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

Todos requieren JWT emitido por `auth-service`. Operaciones de escritura
requieren rol `laboratorio` o `admin`.

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/health` | Estado del servicio |
| GET | `/api/laboratorio/ordenes-pendientes` | Examenes sin resultado |
| GET | `/api/laboratorio/pacientes/dpi/:dpi` | Identificar paciente |
| POST | `/api/laboratorio/resultados/examen/:idExamen` | Registrar resultado |
| GET | `/api/laboratorio/resultados/examen/:idExamen` | Consultar resultado |
| GET | `/api/laboratorio/examenes/:idExamen/costo` | Costo con descuento fundacion |

## Reglas de negocio

- **RN-09**: descuento de fundacion aplicado (por defecto 20%,
  configurable via `DESCUENTO_FUNDACION`).
- Un examen solo puede tener un resultado; segundo intento → 409.
- El tipo del resultado (`texto`, `numerico`, `archivo`, `mixto`)
  determina cuales campos son obligatorios.
