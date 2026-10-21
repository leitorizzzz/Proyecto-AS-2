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
`GET /api/auth/usuarios?rol=a,b` (admin, coordinador_fundacion) devuelve el
directorio sin `passwordHash` (solo cuentas activas); lo usa el diálogo
"Asignar cita". `PATCH /api/auth/usuarios/:id/{desactivar,reactivar}`
(admin; no puede desactivarse a sí mismo). Login de cuenta desactivada →
**403** "Cuenta desactivada" (solo con password correcta). Ojo: un JWT ya
emitido sigue válido hasta su `exp` en los demás servicios.
**`JWT_EXPIRES_IN` solo aplica aquí** (es quien firma); los demás servicios
solo verifican con `JWT_SECRET` y respetan el `exp` embebido en el token.

### `pacientes-service/` — ✅ funcional, agrupa 3 dominios
**Importante:** Solicitudes y Visita Médica NO son microservicios aparte —
viven dentro de `pacientes-service` porque comparten agregado transaccional
con Paciente (crear visita ⇒ transiciona la solicitud). Cada dominio
mantiene sus propias 4 capas dentro del mismo servicio:

- **Paciente**: `PacienteController/Service/Repository`, modelo `Paciente`.
  Alta y edición: `enfermero`, `admin`. **DELETE = borrado lógico**
  (`activo = 0`, solo `admin`), `PATCH /:id/reactivar` (admin). Los
  listados filtran activos; `?incluirInactivos=true` solo admin (403).
  Regla **paciente activo** en `services/reglasPaciente.js`: a un
  desactivado no se le crean solicitudes, citas, visitas, exámenes ni
  prescripciones → 409.
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
(`AsiloCabezaAlgodon`). Escrituras de inventario y dispensación: solo
`farmacia`, `admin` (antes del 19 oct cualquier autenticado podía).
`DELETE /medicamentos/:id` = borrado lógico; reactivar solo admin. No se
dispensa a pacientes desactivados (lee `pacientes.activo` en la BD
compartida) ni medicamentos desactivados → 409.

### `laboratorio-service/` — ✅ funcional, puerto 3003
`LaboratorioController` → `ordenesPendientes`, `identificarPaciente(dpi)`,
`registrarResultado`, `calcularCostoConDescuento(examenId)`.
Tabla propia `resultados_examenes` (1 resultado por examen, UNIQUE); lee
`visita_examenes` (mismo BD compartido) para saber qué está pendiente y la
marca `disponible` al registrar. Precios base en `examenes_precios`,
administrables con `GET/POST/PUT /api/laboratorio/precios` (lectura
cualquier autenticado, escritura solo admin; `PrecioExamen`,
`PrecioExamenRepository`). Descuento fundación RN-09 configurable via
`DESCUENTO_FUNDACION`; el listado de precios ya trae `precioConDescuento`.
El costo de un examen se busca por coincidencia exacta del `tipo`.

### `financiero-service/` — ✅ funcional, puerto 3004
`FinancieroController` → `estadoCuenta`, `registrarCargo`,
`registrarPago-cuota`, `registrarDonante/Donacion`, `registrarGasto`,
`registrarPagoFundacion`. `FinancieroService` implementa
`generarAlertaSaldo` con umbral `UMBRAL_ALERTA_SALDO`. Repositorios:
`CuentaRepository`, `DonanteRepository`, `MovimientosRepository`.
Donantes con borrado lógico (`PATCH /donantes/:id/{desactivar,reactivar}`,
admin); donación a donante desactivado → 409.

### `reportes-service/` — ✅ funcional, puerto 3005
Los 7 reportes del enunciado exportables a JSON, PDF (pdfkit) o Excel
(exceljs). No crea tablas propias; consulta todas las demás en la BD
compartida vía `ReportesRepository`. `GET /api/reportes/tipos` lista los
identificadores; `GET /api/reportes/:tipo?desde=&hasta=&formato=` genera.
También sirve **`GET /api/auditoria`** (solo admin, solo lectura):
`AuditoriaController/Service/Repository`, filtros `desde`, `hasta`
(YYYY-MM-DD inclusivo o instante ISO), `entidad`, `idEntidad`, `limite`.

### Borrado lógico y auditoría (20 oct 2026)
- `activo BIT NOT NULL DEFAULT 1` (ALTER idempotente) en `pacientes`,
  `usuarios`, `medicamentos`, `donantes`. No hay DELETE físico en ellas.
- Tabla compartida `auditoria` (id, usuario = email del JWT, idUsuario,
  accion, entidad, idEntidad, detalle, fecha UTC). La crean auth,
  pacientes, farmacia y financiero al arrancar (DDL que tolera la carrera,
  errores 2714/1913) y la escriben desde sus **controladores** con
  `AuditoriaService` — copia idéntica de `RegistroAuditoria` +
  `AuditoriaRepository` + `AuditoriaService` en los cuatro, como
  `autorizarRoles`. Registrar nunca rompe la operación (solo avisa en log).
  Acciones: crear, modificar, cancelar, desactivar, reactivar. Laboratorio
  y notificaciones no auditan. Detalle en `CONTEXT_SISTEMA.md` §3.4 y §3.5.

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

**Diálogos propios**: no queda ningún `prompt()/confirm()/alert()`.
`abrirDialogo()` / `confirmar()` / `avisar()` en `app.js` usan un
`<dialog>` con `showModal()` (Esc cierra, Tab atrapado, foco vuelve al
botón de origen); con `alEnviar` el error del backend se muestra dentro
del diálogo sin cerrarlo. Los usan Asignar cita, Iniciar visita,
Cancelar solicitud, Cerrar visita, Ver costo, Editar paciente, Editar
precio, Desactivar/Reactivar (pacientes, medicamentos, donantes, cuentas)
y el aviso de inactividad. Cuidado al editar `app.js` con scripts: en
`String.replace` el texto de reemplazo interpreta `$$` como `$` (rompe
los `$$(...)`); usar una función como reemplazo.

**Secciones solo admin**: **Usuarios** (lista con estado, desactivar /
reactivar, alta de cuenta) y **Auditoría** (rango + entidad; los límites
del día local se mandan como instantes ISO). Pacientes, inventario y
donantes muestran chip `activo` / `desactivado` (⊘, borde punteado) y
"Ver también desactivados" solo para admin.

**Cierre por inactividad**: `INACTIVIDAD_MIN = 30`, `AVISO_ANTES_SEG = 60`
en `app.js`; la última actividad vive en `localStorage`
(`asilo.ultimaActividad`) y la comparten las pestañas;
`iniciarControlInactividad({ limiteMs, avisoMs })` permite probarlo con
límites cortos desde la consola.

**RBAC en la UI**: cada sección se oculta del menú si el rol no la usa
y cada formulario de escritura se deshabilita si el rol no tiene
permiso (tabla centralizada en `RBAC.tabs` + `RBAC.acciones` de
`app.js`, alineada con §3.3 de `CONTEXT_SISTEMA.md`). `admin` ve todas
las secciones pero en acciones figura explícito solo donde el backend
lo acepta (no crea solicitudes ni escribe en visitas). El backend sigue
siendo la autoridad; la UI solo evita que el usuario se tope con 403.

**Fechas**: las columnas `DATE` llegan como medianoche UTC; `fechaCorta()`
las formatea en UTC y `fechaLocalISO()` arma YYYY-MM-DD local. No usar
`toISOString().slice(0,10)` para "hoy" (en UTC-6 da el día siguiente).

**Rangos de reportes contextuales**: financieros → mes en curso;
operativos (exámenes, medicamentos) → últimos 30 días; análisis
(costos por paciente, análisis médico) → últimos 90 días.

### Pruebas automatizadas — ✅
Suite jest+supertest a nivel raíz. Comando: `npm run test:todo` o
`scripts/run-all-tests.sh|.ps1`. Última ejecución (20 oct 2026):
**156/156** en 22 archivos. `express`,
`jsonwebtoken` y `bcryptjs` son devDependencies de la raíz para que las
pruebas RBAC no dependan de los `node_modules` de cada servicio.
E2E (`npm run test:e2e`, stack arriba): **39/39**. **Regla: el e2e solo
toca registros que crea** (pacientes "E2E …", medicamento "E2E
medicamento <ts>", precio "E2E examen (no usar)", donantes y cuentas
"e2e.*"); los datos existentes solo se leen. Mapa de casos SQA ↔
pruebas, 1 a 1, en [`docs/PLAN_PRUEBAS.md`](docs/PLAN_PRUEBAS.md).
Sin pruebas unitarias: los 7 reportes (solo e2e) y el frontend.

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

1. Insertar las capturas reales en `docs/MANUAL_USUARIO.md` (28
   marcadores `[CAPTURA: ...]`).
2. Renderizar los `.mmd` a PNG con mermaid-cli para la entrega impresa
   (hoy sólo quedan como fuente .mmd).
3. Un JWT emitido antes de desactivar una cuenta sigue valiendo hasta su
   `exp` (8 h): los servicios no consultan `usuarios.activo` en cada
   request. Cerrar ese hueco requiere lista de revocación o tokens cortos.
4. Flujo de "asociar medicamento del inventario a una prescripción ya
   emitida sin idMedicamento" (hoy hay que crear otra prescripción).
5. Reportes extra o auto-paginación cuando una tabla supere N filas.
   Los gastos operativos no aparecen en ningún reporte.
6. Sin pantalla (solo API): alta/edición de inventario de farmacia, log
   de notificaciones y su reintento manual. (El alta de usuarios ya está
   en la sección Usuarios.)
7. Sin `package-lock.json` en laboratorio, financiero, reportes y
   notificaciones: el build resuelve versiones nuevas (ya avisa
   `EBADENGINE`, dependencias de mssql piden Node 22 y la imagen es
   Node 20).
8. Brevo real nunca probado (procedimiento en
   `notificaciones-service/README.md`).

## Reglas de negocio críticas (no romper al tocar código existente)

- RN-02: no solicitudes duplicadas activas por paciente+especialidad.
- Visita médica: diagnóstico + observaciones obligatorios para completar.
- Paciente activo: a un paciente desactivado no se le crean
  solicitudes, citas, visitas, exámenes, prescripciones ni
  dispensaciones (409). Implementada el 20 oct 2026.
- No hay borrado físico de pacientes, usuarios, medicamentos ni donantes.
- RN-06: prescripción válida antes de permitir despacho en farmacia.
- RN-09: descuento 20% fundación siempre aplicado en cálculos de costo.
- Estados de solicitud/visita son inmutables una vez `completada`/`cancelada`.

## Preferencias de Leo al trabajar

- Archivos completos y listos para usar, no fragmentos para ensamblar.
- Seguir exactamente la estructura de 4 capas ya usada en los 3 servicios
  existentes — no introducir un patrón distinto "mejor" sin consultarlo.
- Nombrar clases y campos de dominio en español; código técnico en inglés.
