# Microservicio de Reportes — Asilo Cabeza de Algodon

Genera los **7 reportes del enunciado** en JSON, PDF (pdfkit) o Excel
(exceljs). No crea tablas propias: lee de la BD compartida
`AsiloCabezaAlgodon`.

## 4 capas
```
src/
├── controllers/  ReportesController
├── routes/       reportesRoutes
├── services/     ReportesService (armado + exportacion PDF/Excel)
├── repositories/ ReportesRepository (consultas transversales) · database
├── models/       Reporte
└── middleware/   authMiddleware · autorizarRoles
```

## Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/health` | Estado |
| GET | `/api/reportes/tipos` | Lista los 7 tipos disponibles |
| GET | `/api/reportes/:tipo?desde=&hasta=&formato=json\|pdf\|excel[&idPaciente=]` | Genera el reporte |

**Tipos disponibles:** `costos-por-paciente`, `analisis-medico`,
`cobros-por-rango`, `pagos-fundacion`, `entradas`, `examenes`,
`medicamentos-aplicados`.

## Ejemplo
```bash
curl "http://localhost:3005/api/reportes/entradas?desde=2026-01-01&hasta=2026-12-31&formato=pdf" \
  -H "Authorization: Bearer $TOKEN" -o entradas.pdf
```
