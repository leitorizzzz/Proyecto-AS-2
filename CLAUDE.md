# CLAUDE.md — Contexto del proyecto para Claude Code

> Sistema de Gestión Integral — Asilo de Ancianos "Cabeza de Algodón"
> UMG Centro Regional de Mazatenango — Análisis y Diseño de Sistemas II (Ing. Angel Atilio Maltez C.)
>
> Este archivo lo mantiene actualizado Leo junto con una sesión de Claude en
> claude.ai (Cowork) que trabaja el resto del proyecto (documentación,
> diagramas UML, planificación). Este archivo es el puente: léelo primero
> antes de tocar código, y no lo borres — si algo cambia, se actualiza aquí.
>
> Fuente de verdad adicional: `CONTEXT_SISTEMA.md` en esta misma carpeta
> tiene el detalle completo de reglas de negocio, roles y tablas SQL.
> Este CLAUDE.md es el resumen operativo rápido.

## Arquitectura

Microservicios independientes en Node.js + Express, cada uno con
**4 capas obligatorias** (pedido explícito del catedrático):

```
Presentación (routes) → Lógica de Negocio (controllers/services) → Acceso a Datos (repositories) → Entidades/Modelos (models)
```

Base de datos única y compartida: SQL Server, base `AsiloCabezaAlgodon`
(sin patrón database-per-microservice — fue evaluado y rechazado).
Mapeo objeto-relacional manual en la capa de repositorio, sin ORM.

Convención de nombres: dominio de negocio en español (clases, campos),
estructura técnica Node.js en inglés (Controller, Service, Repository,
routes, middleware).

Despliegue: Docker Compose en servidor Debian (Lenovo), accesible por
Tailscale (100.96.172.77) o red local (192.168.1.100). Flujo de Leo:
cambios en Windows → `git push` → SSH al Debian → `git pull` →
`docker compose up -d --build`. Nginx sirve el frontend en el puerto 8090.

## Estado real del código (verificado en el repo, no supuesto)

### `auth-service/` — ✅ funcional
JWT (HS256) + bcrypt. Roles válidos: `enfermero, medico, medico_general,
especialista, medico_especialista, farmacia, laboratorio, admin,
fundacion, coordinador_fundacion`. Registro protegido (solo admin).
Estructura: `AuthController`, `AuthService`, `UsuarioRepository`, `Usuario`.

### `pacientes-service/` — ✅ funcional, agrupa 3 dominios
**Importante:** Solicitudes y Visita Médica NO son microservicios aparte —
viven dentro de `pacientes-service` porque comparten agregado transaccional
con Paciente (crear visita ⇒ transiciona la solicitud). Cada dominio
mantiene sus propias 4 capas dentro del mismo servicio:

- **Paciente**: `PacienteController/Service/Repository`, modelo `Paciente`.
- **SolicitudReferencia**: `SolicitudController/Service/Repository`, modelo
  `SolicitudReferencia`. Flujo: `medico_general` crea solicitud →
  `coordinador_fundacion`/`admin` asigna cita → `medico_especialista`
  convierte a visita. RN-02: no permitir 2 solicitudes activas
  (`pendiente_asignacion`, `cita_asignada`, `en_atencion`) para la misma
  especialidad del mismo paciente → 409.
- **VisitaMedica**: `VisitaMedicaController/Service/Repository`, modelo
  `VisitaMedica`. Completar visita exige `diagnostico` y `observaciones`
  no vacíos → 400 si faltan. Estado inmutable tras `completada`/`cancelada`.
  Hoy los exámenes y prescripciones de la visita se registran **localmente
  dentro de la visita** (tablas `visita_examenes`, `visita_prescripciones`),
  sin conexión real a laboratorio-service ni farmacia-service todavía.

### `farmacia-service/` — ✅ funcional, standalone
`FarmaciaController/Service`, repos separados `MedicamentoRepository` y
`DispensacionRepository`, modelos `Medicamento` y `Dispensacion`.
Dispensación aplica 20% de descuento fundación (RN-09). Ya migrado de
SQLite a SQL Server (`AsiloCabezaAlgodon`).

### `laboratorio-service/` — ✅ funcional, puerto 3003
`LaboratorioController` → `ordenesPendientes`, `identificarPaciente(dpi)`,
`registrarResultado`, `calcularCostoConDescuento(examenId)`.
Tabla propia `resultados_examenes` (1 resultado por examen, UNIQUE); lee
`visita_examenes` (mismo BD compartido) para saber qué está pendiente y la
marca `disponible` al registrar. Precios base en `examenes_precios`,
descuento fundación RN-09 configurable via `DESCUENTO_FUNDACION`.

### `financiero-service/` — ✅ funcional, puerto 3004
`FinancieroController` → `estadoCuenta`, `registrarCargo`,
`registrarPago-cuota`, `registrarDonante/Donacion`, `registrarGasto`,
`registrarPagoFundacion`. `FinancieroService` implementa
`generarAlertaSaldo` con umbral `UMBRAL_ALERTA_SALDO`. Repositorios:
`CuentaRepository`, `DonanteRepository`, `MovimientosRepository`.

### `reportes-service/` — ✅ funcional, puerto 3005
Los 7 reportes del enunciado exportables a JSON, PDF (pdfkit) o Excel
(exceljs). No crea tablas propias; consulta todas las demás en la BD
compartida vía `ReportesRepository`. `GET /api/reportes/tipos` lista los
identificadores; `GET /api/reportes/:tipo?desde=&hasta=&formato=` genera.

### `notificaciones-service/` — ✅ funcional, puerto 3006
Correo transaccional vía Brevo (`api-key` + JSON a
`/v3/smtp/email`). Tabla `notificaciones` guarda cada intento con estado
`pendiente | enviada | fallida`. Con `MODO_SIMULACION=true` no llama a
Brevo (útil en dev/CI). `pacientes-service` invoca
`POST /api/notificaciones/solicitud` en modo fire-and-forget al crear una
solicitud (`NotificacionesClient`); si Brevo o el servicio caen, la
solicitud se crea igual y el error queda en el log.

### `frontend/` — ✅ funcional, puerto 8090
HTML/CSS/JS plano servido por nginx. Un solo `index.html` + `styles.css`
+ `app.js`. Sistema de tokens propios (paleta cálida terracota + salvia,
tipografía Fraunces/Inter cargadas desde Google Fonts) aplicando la skill
`frontend-design` — decisiones deliberadas sobre "AI-generic defaults".
Sidebar con las 8 secciones (Panel, Pacientes, Solicitudes, Visitas,
Farmacia, Laboratorio, Financiero, Reportes). Bootstrap 5 fue evaluado
pero se optó por CSS custom para poder aplicar el sistema de tokens sin
pelear con estilos por defecto.

## Pendiente de implementar

1. **Conectar prescripciones de visita a `farmacia-service`**: hoy
   `visita_prescripciones` sólo se guarda localmente en pacientes-service.
   Al aplicar RN-06 hay que validar contra prescripción existente antes
   de permitir un `POST /api/farmacia/dispensaciones`. Llamada HTTP
   directa (patrón adoptado en el resto del sistema).
2. **Reintentos automáticos** para notificaciones fallidas (hoy: fire-and-forget).
3. **Refinamiento de RBAC** en las nuevas UI (algunas acciones se muestran
   siempre y el 403 se ve al ejecutarlas — funcional pero áspero).
4. **Rangos de reportes por defecto contextuales** (hoy: últimos 3 meses).

## Reglas de negocio críticas (no romper al tocar código existente)

- RN-02: no solicitudes duplicadas activas por paciente+especialidad.
- Visita médica: diagnóstico + observaciones obligatorios para completar.
- Paciente debe estar activo para cualquier operación sobre él.
- RN-06: prescripción válida antes de permitir despacho en farmacia.
- RN-09: descuento 20% fundación siempre aplicado en cálculos de costo.
- Estados de solicitud/visita son inmutables una vez `completada`/`cancelada`.

## Preferencias de Leo al trabajar

- Archivos completos y listos para usar, no fragmentos para ensamblar.
- Seguir exactamente la estructura de 4 capas ya usada en los 3 servicios
  existentes — no introducir un patrón distinto "mejor" sin consultarlo.
- Nombrar clases y campos de dominio en español; código técnico en inglés.
