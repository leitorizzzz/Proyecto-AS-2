# Microservicio Financiero — Asilo Cabeza de Algodon

Modulo de **Entradas, Salidas y Caja**: cargos por servicios prestados,
cuotas mensuales de familiares, donaciones, gastos operativos, pagos a
la fundacion. Es la fuente para el estado de cuenta por paciente y para
la seccion financiera de reportes.

## 4 capas
```
src/
├── controllers/  FinancieroController
├── routes/       financieroRoutes
├── services/     FinancieroService
├── repositories/ CuentaRepository · DonanteRepository · MovimientosRepository · database
├── models/       CargoServicio · CuotaMensual · Donante · Donacion · GastoOperativo · PagoFundacion
└── middleware/   authMiddleware · autorizarRoles
```

## Tablas propias (en `AsiloCabezaAlgodon`)
`cargos_servicio`, `cuotas_mensuales`, `donantes`, `donaciones`,
`gastos_operativos`, `pagos_fundacion`.

## Endpoints (todos requieren JWT)

| Metodo | Ruta | Rol |
|---|---|---|
| GET | `/api/financiero/estado-cuenta/:idPaciente` | autenticado |
| POST | `/api/financiero/cargos` | admin |
| POST | `/api/financiero/pagos-cuota` | admin |
| GET/POST | `/api/financiero/donantes` | GET autenticado / POST admin |
| GET/POST | `/api/financiero/donaciones` | GET autenticado / POST admin |
| GET/POST | `/api/financiero/gastos` | GET autenticado / POST admin |
| GET/POST | `/api/financiero/pagos-fundacion` | GET autenticado / POST admin |

## Alerta de saldo
Si el saldo pendiente del paciente (cargos + cuotas) supera
`UMBRAL_ALERTA_SALDO` (Q1000 por defecto), la respuesta del estado de
cuenta incluye `alerta: { nivel: 'alto', mensaje: ... }`.
