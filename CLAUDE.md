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
**`JWT_EXPIRES_IN` solo aplica aquí** (es quien firma); los demás servicios
solo verifican con `JWT_SECRET` y respetan el `exp` embebido en el token.

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
- **Exámenes y prescripciones de la visita**: viven en
  `visita_examenes` y `visita_prescripciones`, propiedad de este
  servicio. `laboratorio-service` y `farmacia-service` **sí** las leen
  y las marcan como `disponible`/`dispensada` (lectura directa de la BD
  compartida; ver `CONTEXT_SISTEMA.md` §4.1). RN-06 queda cubierta por
  `farmacia-service`: no se dispensa sin prescripción pendiente con
  `idMedicamento` asociado.

### `farmacia-service/` — ✅ funcional
`FarmaciaController/Service`, repos: `MedicamentoRepository`,
`DispensacionRepository` y **`PrescripcionReadRepository`** (lee y marca
`visita_prescripciones` para RN-06, misma BD compartida). Modelos:
`Medicamento`, `Dispensacion`, **`Prescripcion`**. Dispensación aplica
20 % de descuento fundación (RN-09). Ya migrado de SQLite a SQL Server
(`AsiloCabezaAlgodon`).

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
Correo transaccional vía Brevo (`api-key` + JSON a `/v3/smtp/email`).
Tabla `notificaciones` guarda cada intento con estado
**`pendiente | enviada | fallida | fallida_definitiva`** (4 estados;
`fallida_definitiva` cuando se agota `NOTIF_MAX_INTENTOS`). Job interno
reintenta las fallidas con backoff exponencial
(`NOTIF_ESPERA_BASE_SEG` → `NOTIF_ESPERA_MAX_SEG`). Con
`MODO_SIMULACION=true` no llama a Brevo (útil en dev/CI).
`pacientes-service` invoca `POST /api/notificaciones/solicitud` en modo
fire-and-forget al crear una solicitud (`NotificacionesClient`); si Brevo
o el servicio caen, la solicitud se crea igual y el reintento lo hace el
job interno. `POST /api/notificaciones/:id/reintentar` fuerza un reintento
manual (solo admin).

### `frontend/` — ✅ funcional, puerto 8090
HTML/CSS/JS plano servido por nginx. Un solo `index.html` + `styles.css`
+ `app.js`.

**Identidad visual "Editorial Data-Dense" (tercera iteración, 12 oct
2026)**, elegida con la skill `ui-ux-pro-max`. Fuente de verdad:
[`design-system/asilo-cabeza-de-algodon/MASTER.md`](design-system/asilo-cabeza-de-algodon/MASTER.md);
los tokens viven como variables CSS en `:root` de `styles.css`.
Reemplaza a la identidad "clínica" azul zafiro + verde bosque / IBM
Plex Sans — no reintroducir esos colores.

- **Paleta**: casi monocroma. Papel `#FAFAFA`, tarjeta `#FFFFFF`,
  tinta `#09090B`/`#18181B`, líneas `#D4D4D8`, y **un solo acento
  magenta `#D11A6D`** (hover `#A0144F`, tint `#FBE8F0`) para marca,
  foco y la acción primaria. Semánticos: ok `#15803D`, aviso
  `#A16207`, error `#B91C1C`, info `#1D4ED8`, cada uno con su tint.
- **Tipografías** (Google Fonts, `@import` en `styles.css`): **Libre
  Bodoni** para H1, marca del sidebar y valores de KPI; **Public
  Sans** para cuerpo, tablas y formularios; **IBM Plex Mono** solo
  para columnas numéricas (`td.num`) y contadores.
- **Estados nunca solo por color**: los mensajes llevan prefijo
  (`✓ Ok —`, `⚠ Aviso —`, `✕ Error —`) y cada chip combina símbolo +
  patrón de borde: pendiente ◔ dashed, cita_asignada ● sólido 1px,
  en_atencion ◉ sólido 2px, completada/pagada/disponible/dispensada
  ✓ double 3px, cancelada ✕ sólido 1px. Verificado en escala de
  grises.
- **Layout**: login a dos paneles (lateral oscuro + formulario);
  shell con sidebar de 248px (regleta magenta, grupos I. Cuidado /
  II. Servicios / III. Administración) y `main.stage` con ancho
  máximo 1280px. Panel con un KPI "hero" oscuro + 3 compactos.
  Controles ≥ 44px, foco visible. Bajo 960px el sidebar pasa arriba.
- `nginx.conf` sirve `index.html` con `no-store` y `*.css`/`*.js` con
  `no-cache` (no llevan hash en el nombre; sin eso un redeploy
  mezclaba HTML nuevo con CSS/JS viejos).

Bootstrap 5 fue evaluado y descartado: el CSS propio es más corto y
permite aplicar la skill sin pelear con defaults.

**RBAC en la UI**: cada sección se oculta del menú si el rol no la usa
y cada formulario de escritura se deshabilita si el rol no tiene
permiso (tabla centralizada en `RBAC.tabs` + `RBAC.acciones` de
`app.js`, alineada con §3.3 de `CONTEXT_SISTEMA.md`). El backend sigue
siendo la autoridad; la UI solo evita que el usuario se tope con 403.

**Rangos de reportes contextuales**: financieros → mes en curso;
operativos (exámenes, medicamentos) → últimos 30 días; análisis
(costos por paciente, análisis médico) → últimos 90 días.

### Pruebas automatizadas — ✅
Suite jest+supertest a nivel raíz. Comando: `npm run test:todo` o
`scripts/run-all-tests.sh|.ps1`. Última ejecución 45/45 pasando.
Mapa de casos SQA ↔ pruebas en [`docs/PLAN_PRUEBAS.md`](docs/PLAN_PRUEBAS.md).

### Datos de demo — ✅
`scripts/seed-demo.js` (`npm run seed:demo`). Idempotente, pobla
usuarios por rol, pacientes, solicitudes en cada estado, visita
completada con prescripción y examen, donaciones y gastos. Documentado
en [`scripts/README.md`](scripts/README.md).

### Documentación adicional
- [`docs/ERD.mmd`](docs/ERD.mmd) — ERD completo de `AsiloCabezaAlgodon` (Mermaid).
- [`docs/COMPONENTES.mmd`](docs/COMPONENTES.mmd) — diagrama de componentes.
- [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) — borrador con marcadores `[CAPTURA: ...]`.
- [`docs/PLAN_PRUEBAS.md`](docs/PLAN_PRUEBAS.md) — plan de pruebas con tabla ID → test.

## Pendiente de implementar

1. Insertar las capturas reales en `docs/MANUAL_USUARIO.md`.
2. Renderizar los `.mmd` a PNG con mermaid-cli para la entrega impresa
   (hoy sólo quedan como fuente .mmd).
3. Pantalla de administración para `examenes_precios` (hoy sólo seed).
4. Flujo de "asociar medicamento del inventario a una prescripción ya
   emitida sin idMedicamento" (hoy hay que crear otra prescripción).
5. Reportes extra o auto-paginación cuando una tabla supere N filas.
6. Huecos de la UI detectados al probarla en navegador (12 oct 2026):
   "Asignar cita" pide fecha/hora/ID de médico con `prompt()` nativo
   (sin selector de especialista); no hay formulario para gastos
   operativos ni pagos a fundación (solo API); no hay edición de
   paciente en pantalla (solo `PUT /api/pacientes/:id`).

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
