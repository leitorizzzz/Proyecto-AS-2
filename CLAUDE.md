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
**Contraseñas (Análisis, RF-42)**: una sola regla en
`services/reglasPassword.js` — mínimo 8 caracteres, al menos una letra y
un número (máx. 72 bytes, límite de bcrypt) — usada en el alta, en
`POST /api/auth/cambiar-password` (propio usuario, exige la actual; solo
API, sin pantalla) y en el restablecimiento. El mensaje dice en español
todo lo que falta. Los seeds (Admin12345, Demo1234, E2eDemo1234) cumplen.
**Límite de intentos**: `services/LimitadorIntentos.js`, en memoria (sin
dependencias). Máximo 5 intentos fallidos por IP real (`req.ip`, trust
proxy) + correo en 15 minutos (`LIMITE_INTENTOS`, `LIMITE_VENTANA_MIN`):
en el login cuentan los 401; en `/recuperar` cuenta cada solicitud (no se
puede distinguir sin revelar si la cuenta existe). El sexto → **429**
*"Demasiados intentos. Por seguridad, espere N minutos…"* con
`Retry-After`, sin consultar credenciales. Un login correcto reinicia el
contador. Se pierde al reiniciar auth-service y no se comparte entre
réplicas (hay una).
`GET /api/auth/usuarios` también lo usa `medico_general` (elige al
enfermero de la solicitud). **bcrypt corre en hilos de trabajo**
(`services/hashPool.js` + `hashWorker.js`, `HASH_HILOS`): mismo algoritmo
y costo 10, pero los logins simultáneos ya no se atienden en fila (caso 25:
login máx. 7,1 s → < 1 s con 50 usuarios).
**Recuperación de contraseña (RF-42, UC-10.4)**: `POST /api/auth/recuperar`
{email} responde siempre el mismo 200 (exista o no la cuenta; el trabajo
sigue en segundo plano) y `POST /api/auth/restablecer` {token, password}.
`RecuperacionService` + `TokenRecuperacionRepository` (tabla
`tokens_recuperacion`, solo el hash SHA-256 del token de 256 bits, vence
en `RECUPERACION_MINUTOS`=30, un solo uso con UPDATE condicional en la
misma transacción que cambia la contraseña; pedir otro invalida los
anteriores). La nueva contraseña usa la misma regla que el alta
(`services/reglasPassword.js`: mínimo 8 caracteres, al menos una letra y un número). El correo sale por
notificaciones-service (`POST /api/notificaciones/recuperacion`, solo JWT
de servicio rol `sistema` firmado por auth, 1 min) con el enlace
`RECUPERACION_URL_BASE/#restablecer=<token>`; la API de notificaciones
nunca devuelve ese cuerpo. Se audita la solicitud y el cambio. En el
login, "¿Olvidaste tu contraseña?" abre el formulario; el enlace abre
"Nueva contraseña" y borra el token de la barra de direcciones.

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
  **Egreso (caso 6)**: el DELETE exige `motivoEgreso` (3 a 300
  caracteres; sin él → 400) y acepta `fechaEgreso` (YYYY-MM-DD, por
  defecto hoy en Guatemala; no futura ni anterior al ingreso). Guarda
  `pacientes.fechaEgreso`/`motivoEgreso`; reactivar los limpia (el valor
  anterior queda en la auditoría).
  **Familiar responsable y ficha (caso 5)**: el alta exige `familiar`
  completo (nombres, apellidos, dpi 13 dígitos, parentesco, telefono,
  email, direccion; `services/reglasFamiliar.js`) → 400 con
  `camposFaltantes`; en la misma transacción crea `familiares` (uno
  `principal` activo por paciente) y `fichas_medicas` (1:1).
  `PUT /:id/familiar` lo corrige. `pacientes.familiarEmail` queda como
  copia del correo del principal.
- **SolicitudReferencia**: `SolicitudController/Service/Repository`, modelo
  `SolicitudReferencia`. Flujo: `medico_general` crea solicitud →
  `coordinador_fundacion`/`admin` asigna cita → `medico_especialista`
  convierte a visita. RN-02: no permitir 2 solicitudes activas
  (`pendiente_asignacion`, `cita_asignada`, `en_atencion`) para la misma
  especialidad del mismo paciente → 409 con `solicitudActiva {id, estado}`.
  `idEnfermero` obligatorio (usuario activo con rol `enfermero`, caso 7).
  Asignar cita deja **avisos internos** (tabla `avisos`, tipo
  `cita_asignada`) al médico general y al enfermero en la misma
  transacción; `GET /api/avisos[?noLeidos=true]`, `PATCH /api/avisos/:id/leido`
  (`AvisoController/Service/Repository`, modelo `Aviso`).
- **VisitaMedica**: `VisitaMedicaController/Service/Repository`, modelo
  `VisitaMedica`. Completar visita exige `diagnostico` y `observaciones`
  no vacíos → 400 con `camposFaltantes` y la visita pasa a **`incompleta`**
  (sigue editable). Estado inmutable tras `completada`/`cancelada`.
  Queda vinculada a la ficha (`idFichaMedica`). **Cierre = cargo atómico
  (caso 19)**: `VisitaMedicaRepository.completarConCargo` en una
  transacción bloquea la visita, calcula consulta (`tarifas_servicio`
  `consulta_especialista`) + laboratorio + farmacia con RN-09, inserta
  `cargos_servicio` (`origen='visita'`, `idFamiliar`) + `cargos_detalle`
  y cierra visita y solicitud; un segundo cierre → 409 (índice único
  `UX_cargos_visita`). Sin tarifa, examen sin precio o familiar
  incompleto → 409 y no se cierra.
  **Exámenes (caso 15)**: al ordenar se congelan `precioBase`,
  `descuento` y `costo` en `visita_examenes`; tipo sin precio en
  `examenes_precios` → 409. **Prescripciones (caso 18)**:
  `cantidadPrescrita` obligatoria; estados `pendiente → parcial →
  dispensada` según `cantidadEntregada`.
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
**Despacho parcial (caso 18)**: `DispensacionRepository.registrarDespacho`
en una transacción (bloquea primero la visita, como el cierre, para no
interbloquearse) descuenta stock y `cantidadEntregada` con UPDATE
condicional, guarda `idPrescripcion`/`montoBase` y suma
`visitas_medicas.costoFarmacia`. Entregar más de lo que falta → 409 sin
tocar stock. Si la visita ya está cerrada, genera un cargo complementario
(`origen='dispensacion'`). El esquema crea `dispensaciones` antes de sus
ALTER (desde cero fallaba hasta el 21 oct).

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
El costo de un examen se busca por coincidencia exacta del `tipo`; si la
orden trae el costo registrado al pedirla, ese manda
(`registradoAlOrdenar: true`). Las órdenes anteriores al 21 oct (NULL)
usan el catálogo actual.

### `financiero-service/` — ✅ funcional, puerto 3004
`FinancieroController` → `estadoCuenta`, `registrarCargo`,
`registrarPago-cuota`, `registrarDonante/Donacion`, `registrarGasto`,
`registrarPagoFundacion`. Repositorios: `CuentaRepository`,
`DonanteRepository`, `MovimientosRepository`, `FamiliarReadRepository`.
Donantes con borrado lógico (`PATCH /donantes/:id/{desactivar,reactivar}`,
admin); donación a donante desactivado → 409.
- **Titular (caso 20)**: la cuenta es del familiar responsable; cargo o
  cuota sin familiar completo → 409 (`services/reglasCuenta.js`).
  `estadoCuenta` trae `familiar`.
- **Cargos**: `cargos_servicio` con `idVisita`, `idDispensacion`,
  `idFamiliar`, `origen` (`manual|visita|dispensacion`), `montoPagado`;
  desglose en `cargos_detalle`; tarifa de consulta en `tarifas_servicio`
  (semilla Q150). **Abonos** `POST /cargos/:id/abonos` (admin, tabla
  `abonos_cargo`): mayor que el saldo → 409; CHECK
  `CK_cargos_saldo_no_negativo` en la BD. Estados `pendiente|parcial|pagado`.
- **Alertas de cobro (caso 21)**, `services/alertasCobro.js`: **roja** si
  saldo ≥ `UMBRAL_ALERTA_SALDO` o cuota con más de `DIAS_MORA_ROJA` (30)
  días de mora; **naranja** si saldo ≥ `UMBRAL_ALERTA_NARANJA` (por defecto
  la mitad) o alguna cuota vencida. Reemplaza los niveles `bajo|alto`.
  `GET /alertas` (admin, coordinador_fundacion, fundacion) lista las
  cuentas con alerta, rojas primero. `POST /cuotas` (admin) emite la cuota
  pendiente con `fechaVencimiento` (por defecto fin de mes); "hoy" se
  calcula en hora de Guatemala.

### `reportes-service/` — ✅ funcional, puerto 3005
Los 7 reportes del enunciado exportables a JSON, PDF (pdfkit) o Excel
(exceljs). No crea tablas propias; consulta todas las demás en la BD
compartida vía `ReportesRepository`. `GET /api/reportes/tipos` lista los
identificadores; `GET /api/reportes/:tipo?desde=&hasta=&formato=` genera.
`desde`/`hasta` son días de Guatemala y **`hasta` es inclusivo**
(`fecha >= 00:00 GT desde AND fecha < 00:00 GT del día siguiente`);
fecha, `idPaciente` o `formato` inválidos → 400 (caso 23). El Excel lleva
**fórmulas reales** (`SUM` en totales, suma de rubros por fila), banda
institucional, cabecera fija y autofiltro (caso 22). Costos por paciente
sale solo de los cargos, por rubro (consulta, laboratorio, farmacia,
otros): antes sumaba también dispensaciones y contaba farmacia dos veces.
También sirve **`GET /api/auditoria`** (solo admin, solo lectura):
`AuditoriaController/Service/Repository`, filtros `desde`, `hasta`
(YYYY-MM-DD inclusivo o instante ISO), `entidad`, `idEntidad`, `limite`.

### Auditoría SQA final (26 oct 2026) — reglas nuevas
- **Errores 5xx sin detalle**: `middleware/manejoErrores.js` (copia
  idéntica en los 7, instalado tras `express.json()` y después de las rutas
  `/api`): cualquier 5xx responde "Ocurrió un error interno…" y el detalle
  queda en el log; JSON malformado → 400 JSON (antes la página HTML de
  Express con la traza), cuerpo grande → 413.
- **Notificaciones**: `POST /api/notificaciones/solicitud` solo
  `medico_general` (antes cualquier autenticado podía mandar un correo a
  cualquier dirección).
- **Pacientes**: fecha de nacimiento real (existe en el calendario, no
  futura, ≥ 1900); la cita no puede ser anterior a hoy (Guatemala) y el
  médico debe ser especialista activo; una prescripción con `idMedicamento`
  exige medicamento existente (400) y activo (409).
- **Farmacia**: stock entero 0..1 000 000, precio > 0 con 2 decimales, sin
  dos activos con el mismo nombre + presentación (409); el PUT conserva lo
  que no se envía.
- **Financiero**: `services/reglasValores.js` — monto > 0, 2 decimales,
  tope DECIMAL(10,2) (antes "cien" o 1e15 daban 500 con el mensaje de SQL);
  año 2000-2100; fechas que existan; correo y teléfono del donante con
  formato; estado de cuenta de un paciente inexistente → 404.
- **Auth**: login sin correo o contraseña → 400 (no 401) y no suma al
  límite de intentos.
- **Reportes**: "Cobros por rango" y "Entradas de dinero" incluyen los
  **abonos a cargos** (antes ningún reporte de ingresos los mostraba).
- **Frontend**: `esc()` escapa comillas (había XSS almacenado en los
  diálogos de edición: un apellido con `"` inyectaba `onfocus`).
- Mensajes del backend con tildes; seed y e2e calculan la fecha de la cita
  (hoy + N días) en lugar de fechas fijas.

### Borrado lógico y auditoría (20 oct 2026)
- `activo BIT NOT NULL DEFAULT 1` (ALTER idempotente) en `pacientes`,
  `usuarios`, `medicamentos`, `donantes`. No hay DELETE físico en ellas.
- Tabla compartida `auditoria` (id, usuario = email del JWT, idUsuario,
  accion, entidad, idEntidad, detalle, fecha UTC, y desde el caso 24
  `ip`, `modulo`, `datosAnteriores`/`datosNuevos` en JSON sin
  password/hash/token). **IP real (23 oct)**: el navegador llama a los
  servicios por el nginx del frontend (`/svc/<servicio>/...`), que envía
  `X-Real-IP` y `X-Forwarded-For`; auth, pacientes, farmacia y financiero
  tienen `trust proxy` solo para ese nginx (`middleware/confianzaProxy.js`,
  `TRUST_PROXY_HOST=frontend`) y `contextoDe` usa `req.ip`. Un
  `X-Forwarded-For` mandado directo al puerto se ignora. En el servidor
  Debian el nginx recibe la IP real del navegador (Tailscale o LAN), así
  que esa es la que queda auditada; en Docker Desktop (Windows) todo el
  tráfico del host llega como el gateway 172.18.0.1. La crean auth,
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
manual (solo admin). Cada enviada guarda `idMensajeProveedor` (caso 10):
el `messageId` de Brevo, o `sim-<uuid>` en simulación.
`POST /api/notificaciones/recuperacion` (solo JWT de servicio rol
`sistema`, lo firma auth-service) manda el correo de recuperación de
contraseña; el log de la API nunca devuelve su cuerpo. Caso 11 verificado
en vivo el 23 oct: con Brevo inalcanzable la solicitud se crea (201) y
la notificación queda `fallida` → reintentos → `fallida_definitiva`.

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
  ✓ double 3px, cancelada ✕ sólido 1px, incompleta ! sólido 2px,
  parcial ◑ dashed 2px, alerta naranja ◆ dashed 2px (token
  `--naranja #C2410C`), alerta roja ▲ sólido 3px. Verificado en escala
  de grises.
- **Pantallas del plan SQA**: alta de paciente con bloque de familiar
  responsable y acción "Familiar"; selector de enfermero en la
  solicitud; tarjeta **Mis avisos** y **Alertas de cobro** en el panel;
  campos faltantes resaltados al cerrar la visita; costo registrado y
  **Ver resultado** en los exámenes; "Emitir pendiente" en cuotas.
- **Layout**: login a dos paneles (lateral oscuro + formulario);
  shell con sidebar de 248px (regleta magenta, grupos I. Cuidado /
  II. Servicios / III. Administración) y `main.stage` con ancho
  máximo 1280px. Panel con un KPI "hero" oscuro + 3 compactos.
  Controles ≥ 44px, foco visible. Bajo 960px el sidebar pasa arriba.
- `nginx.conf` sirve `index.html` con `no-store` y `*.css`/`*.js` con
  `no-cache` (no llevan hash en el nombre; sin eso un redeploy
  mezclaba HTML nuevo con CSS/JS viejos). Además es el **proxy** hacia
  los 7 servicios: `/svc/<servicio>/...` (resolver de Docker, envía
  `X-Real-IP`/`X-Forwarded-For`). `API` en `app.js` usa ese camino; los
  puertos 3000-3006 siguen publicados (los usan el e2e y la carga).
- **Login**: "¿Olvidaste tu contraseña?" (formulario *Recuperar
  contraseña*) y *Nueva contraseña* al abrir el enlace `#restablecer=`.

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

**Textos para el usuario (24 oct)**: la UI nunca muestra códigos internos.
Estados, roles, especialidades, categorías y entidades pasan por
`etiqueta()` / `textoRol()` de `app.js` (`ETIQUETA_ESTADO`, `ETIQUETA_ROL`,
`ETIQUETA_VALOR`); la clase CSS del chip sigue usando el código. Nada de
"RN-xx", "caso N" ni "enunciado" en pantalla. `api()` reemplaza los 401 de
token y los 403 "Acceso denegado… roles" por mensajes en lenguaje llano. Los
mensajes 409 de estado del backend usan `SolicitudReferencia.etiquetaEstado`
y `VisitaMedica.etiquetaEstado`. `styles.css` empieza con `@charset "UTF-8"`
y nginx envía `charset=utf-8` en HTML/CSS/JS (sin eso los símbolos de los
chips salían como "âœ•").

**Rutas por sección (26 oct)**: cada sección tiene su dirección
(`#/pacientes`, `#/farmacia`…; `cambiarTab(tab, 'push'|'replace'|'ninguno')`
+ `tabDeRuta()` en `app.js`). Recargar conserva la sección, Atrás/Adelante
funcionan y una ruta que el rol no puede ver (o que no existe) cae al panel
y corrige la dirección. Cerrar sesión limpia la ruta. `#restablecer=<token>`
no es una ruta. Verificado en Chrome con admin y farmacia.

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
`scripts/run-all-tests.sh|.ps1`. Última ejecución (26 oct 2026, auditoría
final, stack recién creado con `down -v` + `bootstrap.ps1`): **382/382** en
44 archivos (incluye `frontend/__tests__/esc.test.js`, la primera prueba del
frontend).
**Auditoría SQA (26 oct)**: `npm run test:sqa` (23 casos del plan uno por
uno contra el stack, evidencia en `docs/verificacion-plan-sqa.json`),
`npm run test:caso11` (con `scripts/override-brevo-caido.yml`, Brevo en
127.0.0.1:9), `npm run test:hostil` (matriz rol × escritura según §3.3 +
validaciones: 363 comprobaciones) y `npm run test:integridad` (18 consultas
de consistencia en la BD). Solo stack local: crean registros "SQA …" y usan
`docker exec`. Última: todo en 0 fallas. `express`, `jsonwebtoken`, `bcryptjs`, `exceljs` y `pdfkit` son
devDependencies de la raíz para que las pruebas no dependan de los
`node_modules` de cada servicio.
E2E (`npm run test:e2e`, stack arriba): **62/62**. El paso de RF-42 lee
el enlace de recuperación de la tabla `notificaciones` con `docker exec`
(la API no lo expone); fuera de localhost solo verifica la parte de API. **Regla: el e2e solo
toca registros que crea** (pacientes "E2E …", medicamento "E2E
medicamento <ts>", precio "E2E examen (no usar)", donantes y cuentas
"e2e.*"); los datos existentes solo se leen.
Carga (`npm run test:carga`, `USUARIOS=20..50`): login, listar pacientes,
crear y listar solicitudes; falla si una petición supera 3 s. Última (26
oct, desde cero): 50 usuarios, 600 peticiones, máx. 911 ms, p95 626 ms.
Resultado del plan oficial del SQA (25 casos):
[`docs/RESULTADOS_PLAN_SQA.csv`](docs/RESULTADOS_PLAN_SQA.csv); nombres
del plan ↔ código en [`docs/EQUIVALENCIAS.md`](docs/EQUIVALENCIAS.md).
Mapa de casos ↔ pruebas en [`docs/PLAN_PRUEBAS.md`](docs/PLAN_PRUEBAS.md).
Sin pruebas unitarias: el frontend.

### Datos de demo — ✅
`scripts/seed-demo.js` (`npm run seed:demo`). Idempotente, pobla
usuarios por rol, pacientes con familiar responsable y ficha,
solicitudes en cada estado (con enfermera asignada), visita completada
con prescripción, examen y su cargo, donaciones y gastos. Documentado
en [`scripts/README.md`](scripts/README.md).

### Documentación adicional
- [`docs/ERD.mmd`](docs/ERD.mmd) — ERD completo de `AsiloCabezaAlgodon` (Mermaid).
- [`docs/COMPONENTES.mmd`](docs/COMPONENTES.mmd) — diagrama de componentes.
- [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) — borrador con marcadores `[CAPTURA: ...]`.
- [`docs/PLAN_PRUEBAS.md`](docs/PLAN_PRUEBAS.md) — plan de pruebas con tabla ID → test.

## Pendiente de implementar

1. Insertar las capturas reales en `docs/MANUAL_USUARIO.md` (30
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
   `notificaciones-service/README.md`); el caso 10 solo en simulación y el
   11 con la URL inalcanzable.
9. Caso 24 en el Debian: confirmar con un acceso real por Tailscale/LAN
   que la auditoría muestra la IP del navegador (en Docker Desktop todo
   llega como 172.18.0.1).
10. Ver "Desviaciones respecto al Análisis" (abajo).

## Desviaciones respecto al Análisis

Lo que el prototipo hace distinto de lo especificado o de lo que pediría
un despliegue real. Ninguna rompe una regla de negocio; son límites
conocidos y aceptados para la entrega académica.

1. **HTTP sin HTTPS.** nginx escucha en el 8090 en claro y los servicios
   en 3000-3006 también. Credenciales, JWT y enlaces de recuperación
   viajan sin cifrar en la red (Tailscale cifra el túnel, la LAN no).
2. **Sesiones vigentes tras desactivar una cuenta.** El JWT dura 8 h y
   los servicios solo verifican la firma: una sesión abierta sigue
   funcionando hasta su `exp` aunque la cuenta se desactive (el login
   nuevo sí se bloquea). Faltaría lista de revocación o tokens cortos.
3. **Brevo real no verificado.** Todo correo se probó en
   `MODO_SIMULACION` (ID `sim-...`); la caída se probó con una URL
   inalcanzable. El envío y la entrega reales no se ejecutaron.
4. **Comunicación entre servicios mixta**, no solo HTTP: varios servicios
   leen y escriben tablas de otros en la BD compartida (farmacia ↔
   prescripciones y visitas, laboratorio ↔ exámenes, pacientes escribe
   cargos al cerrar la visita, financiero lee familiares y pacientes,
   reportes lee todo). HTTP + JWT solo para notificaciones. Ver
   `CONTEXT_SISTEMA.md` §4.1.
5. **Base de datos única y usuario `sa`.** Los 7 servicios se conectan a
   SQL Server con la cuenta `sa`; no hay un usuario por servicio con
   permisos mínimos.
6. **Token en `localStorage`.** El frontend guarda el JWT ahí (expuesto
   a un XSS); no usa cookie `HttpOnly`.
7. **Puertos de los servicios expuestos.** Además del nginx, 3000-3006 y
   1433 (SQL Server) están publicados en el host y `cors()` acepta
   cualquier origen. Un `X-Forwarded-For` enviado directo a un puerto ya
   no se audita (solo se confía en el nginx), pero los puertos siguen
   abiertos.
8. **Nombres distintos al plan del SQA** (tabla en
   `docs/EQUIVALENCIAS.md`): `pacientes` en vez de internos, `activo = 0`
   en vez de `estado = 'inactivo'`, estados `fallida`/`fallida_definitiva`
   en vez de "error", etc. El comportamiento es el pedido.
9. **Auditoría parcial.** Laboratorio (resultados y precios) y
   notificaciones no registran auditoría. El log de notificaciones lo
   puede leer cualquier usuario autenticado (salvo el cuerpo de los
   correos de recuperación, que se oculta).
10. **Reportes**: los gastos operativos no aparecen en ninguno de los 7
    reportes; no hay paginación.
11. **Frontend casi sin pruebas automatizadas** (solo `esc()`). El 26 oct
    se recorrió en Chrome con los 7 roles y a 390 px (sin errores de
    consola, sin desborde), y se probaron el diálogo de egreso, recuperar y
    restablecer contraseña, pero por scripts en la página: la extensión no
    pudo tomar capturas de pantalla.
12. **Entrega impresa incompleta**: el manual tiene 30 marcadores
    `[CAPTURA: ...]` sin imagen y los diagramas `.mmd` no están
    renderizados a PNG.
13. **Dependencias sin lockfile** en laboratorio, financiero, reportes y
    notificaciones (el build resuelve versiones nuevas; aviso
    `EBADENGINE` con Node 20).
14. **Lecturas abiertas a cualquier usuario autenticado** (decisión de
    diseño de §3.3, no un error): farmacia o laboratorio pueden consultar
    por API el estado de cuenta de un paciente, donantes, donaciones,
    gastos, los 7 reportes (incluidos los financieros) y el log de
    notificaciones. La UI oculta esas secciones, pero el backend responde.
15. **El médico general elige el destinatario del correo de solicitud**:
    `POST /api/notificaciones/solicitud` acepta el `familiarEmail` que
    llega en el cuerpo; notificaciones no lo compara con el familiar
    registrado del paciente.
16. **Acciones de tabla por debajo de 44 px** de alto (Editar, Familiar,
    Desactivar…): el sistema de diseño pide controles ≥ 44 px; los
    botones y campos sí cumplen.

## Reglas de negocio críticas (no romper al tocar código existente)

- RN-02: no solicitudes duplicadas activas por paciente+especialidad.
- Visita médica: diagnóstico + observaciones obligatorios para completar.
- Paciente activo: a un paciente desactivado no se le crean
  solicitudes, citas, visitas, exámenes, prescripciones ni
  dispensaciones (409). Implementada el 20 oct 2026.
- No hay borrado físico de pacientes, usuarios, medicamentos ni donantes.
- RN-06: prescripción válida antes de permitir despacho en farmacia; no
  se entrega más de lo prescrito.
- RN-09: descuento 20% fundación siempre aplicado en cálculos de costo.
- Estados de solicitud/visita son inmutables una vez `completada`/`cancelada`.
- Cerrar una visita genera su cargo en la misma transacción; nunca dos
  cargos por visita.
- Ningún saldo queda negativo; no se registran cargos ni cuotas a un
  familiar incompleto; todo interno nuevo lleva familiar completo y ficha.
- No se ordena un examen sin precio en el catálogo.

## Preferencias de Leo al trabajar

- Archivos completos y listos para usar, no fragmentos para ensamblar.
- Seguir exactamente la estructura de 4 capas ya usada en los 3 servicios
  existentes — no introducir un patrón distinto "mejor" sin consultarlo.
- Nombrar clases y campos de dominio en español; código técnico en inglés.
