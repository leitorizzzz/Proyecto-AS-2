# Manual de usuario — Sistema Asilo "Cabeza de Algodón"

> Borrador para revisión de SQA. Los marcadores `[CAPTURA: ...]` indican
> dónde deben insertarse pantallazos reales antes de la entrega final.
> Los nombres de pantallas, tarjetas y botones aparecen en **negrita** y
> están escritos tal como se ven en el sistema.

---

## 1. Introducción

Este sistema digitaliza la administración del Asilo de Ancianos "Cabeza
de Algodón". Permite registrar residentes, generar solicitudes de
atención a especialistas, documentar visitas médicas con sus exámenes y
prescripciones, dispensar medicamentos aplicando el descuento de la
fundación, llevar la caja (cargos, cuotas, donaciones) y generar los
reportes del enunciado.

La interfaz es una aplicación web accesible desde el navegador. No
requiere instalación en la computadora del usuario.

---

## 2. Antes de empezar

### 2.1 Dirección del sistema

En la red del asilo: `http://192.168.1.100:8090`
Fuera del asilo (vía Tailscale): `http://100.96.172.77:8090`

[CAPTURA: ventana del navegador con la URL del sistema]

### 2.2 Perfiles y qué ve cada uno

El menú lateral solo muestra las secciones que su perfil utiliza. Los
formularios que su perfil no puede usar aparecen atenuados, con borde
punteado y un mensaje **Aviso —** que explica quién sí puede.

| Perfil | Secciones en el menú | Qué puede registrar |
|---|---|---|
| `admin` | Las ocho | Todo. |
| `enfermero` | Panel, Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Reportes | Pacientes nuevos. |
| `medico_general` | Panel, Pacientes, Solicitudes, Visitas, Reportes | Crear y cancelar solicitudes. |
| `coordinador_fundacion` | Panel, Pacientes, Solicitudes, Visitas, Financiero, Reportes | Asignar cita a las solicitudes. |
| `medico_especialista` | Panel, Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Reportes | Iniciar visitas, notas clínicas, exámenes, prescripciones, cerrar la visita. |
| `laboratorio` | Panel, Pacientes, Laboratorio, Reportes | Resultados de exámenes. |
| `farmacia` | Panel, Pacientes, Farmacia, Reportes | Dispensar prescripciones pendientes. |

Los perfiles antiguos sin sufijo (`medico`, `especialista`,
`fundacion`) existen por compatibilidad con usuarios creados antes del
cambio de nombres: ven las mismas secciones que su equivalente actual,
pero solo consultan.

[CAPTURA: menú lateral de un usuario farmacia, con solo Panel, Pacientes, Farmacia y Reportes]

### 2.3 Cómo leer la pantalla

- **Menú lateral.** Arriba dice *Cabeza de Algodón*. Las secciones
  están agrupadas en **I. Cuidado** (Panel, Pacientes, Solicitudes,
  Visitas), **II. Servicios** (Farmacia, Laboratorio) y
  **III. Administración** (Financiero, Reportes). Abajo aparece su
  correo, su perfil y el enlace **Cerrar sesión**.
- **Etiquetas de estado.** Cada estado lleva un símbolo y un borde
  distinto, de modo que se distinguen aunque la pantalla o la impresión
  sea en blanco y negro:

  | Etiqueta | Símbolo | Borde |
  |---|---|---|
  | `pendiente_asignacion`, `pendiente` | ◔ | punteado |
  | `cita_asignada` | ● | línea fina |
  | `en_atencion` | ◉ | línea gruesa |
  | `completada`, `pagada`, `disponible`, `dispensada` | ✓ | doble línea |
  | `cancelada` | ✕ | línea fina |

- **Mensajes.** Después de cada acción aparece un mensaje bajo el
  botón, que empieza con **Ok —**, **Aviso —** o **Error —**.

[CAPTURA: detalle de las etiquetas de estado en la tabla "Solicitudes recientes"]

---

## 3. Iniciar sesión

1. Abrir la dirección del sistema en el navegador. Aparece la pantalla
   **Iniciar sesión** (panel oscuro a la izquierda, formulario
   *Acceso del personal* a la derecha).
2. Escribir **Correo** y **Contraseña**.
3. Presionar **Entrar**.

[CAPTURA: pantalla de inicio de sesión con los campos Correo y Contraseña y el botón Entrar]

Si los datos no son correctos aparece un mensaje **Error —** bajo el
botón.

**Importante.** La sesión dura 8 horas. Pasado ese tiempo el sistema
pide volver a iniciar sesión. Para salir antes, usar **Cerrar sesión**
al pie del menú lateral.

**Primer acceso al sistema recién desplegado.** Correr una sola vez
desde el servidor:

```
docker compose exec auth-service npm run seed
```

Esto crea el usuario `admin@asilo.gt` con contraseña `Admin12345`.
Cambiarla al entrar.

---

## 4. Pantalla por pantalla

### 4.1 Panel

Es la primera pantalla al entrar. Saluda con *Buen día, (usuario)* y
la fecha del día.

**Quién la ve:** todos.

Cuatro indicadores:

- **Pacientes registrados** (tarjeta oscura, a la izquierda).
- **Solicitudes activas** — pendientes, con cita o en atención.
- **Visitas abiertas** — solicitudes en atención.
- **Alertas de saldo** — pacientes cuyo saldo supera el umbral.

Debajo, la tarjeta **Solicitudes recientes** lista las últimas ocho
con paciente, especialidad, estado y fecha de creación.

[CAPTURA: Panel con los cuatro indicadores y la tabla "Solicitudes recientes"]

### 4.2 Pacientes

**Quién la ve:** todos. **Quién registra:** `enfermero`, `admin`.

A la izquierda, la tarjeta **Residentes** lista a cada paciente con el
correo de su familiar, DPI, fecha de nacimiento y fecha de ingreso.

A la derecha, la tarjeta **Registrar paciente**:

| Campo | Notas |
|---|---|
| **Nombres**, **Apellidos** | Obligatorios. |
| **Fecha de nacimiento** | Obligatoria. |
| **Género** | Femenino, Masculino u Otro. |
| **DPI (13 dígitos)** | Obligatorio y único. |
| **Teléfono**, **Contacto de emergencia** | Opcionales. |
| **Correo del familiar** | Opcional. A esta dirección llegan los avisos automáticos cuando se crea una solicitud. |
| **Dirección**, **Padecimientos conocidos** | Opcionales. |

Presionar **Registrar paciente**. Si ya existe otro paciente con el
mismo DPI, el sistema muestra el motivo y no guarda.

Para los demás perfiles el botón dice *Registro no permitido para su
rol* y los campos están bloqueados.

[CAPTURA: pantalla Pacientes con la tabla "Residentes" y el formulario "Registrar paciente"]

### 4.3 Solicitudes médicas

**Quién la ve:** médicos, coordinación de fundación, enfermería y
`admin`.

A la izquierda, la **Bandeja** con todas las solicitudes: paciente,
especialidad y motivo, estado, cita y acciones. A la derecha, la
tarjeta **Nueva solicitud**.

Flujo de estados:

```
pendiente_asignacion → cita_asignada → en_atencion → completada
                                             │
                                             └─ cancelada (en cualquier
                                                punto previo a completada)
```

**Crear una solicitud** (`medico_general`, `admin`):

1. En **Nueva solicitud**, elegir **Paciente**.
2. Escribir **Especialidad** (el campo sugiere cardiologia,
   neurologia, geriatria, etc.) y **Motivo**.
3. Presionar **Crear solicitud**.

El sistema envía automáticamente un correo al familiar si el paciente
tiene correo registrado. Si el envío falla, la solicitud se crea igual
y el sistema reintenta solo.

**Acciones de la bandeja** (columna *Acciones*; solo aparecen las que
su perfil puede usar):

- **Asignar cita** (`coordinador_fundacion`, `admin`), en solicitudes
  `pendiente_asignacion`. El navegador pregunta, en tres ventanas
  seguidas: fecha (AAAA-MM-DD), hora (HH:mm) y el número (ID) del
  médico especialista.
- **Iniciar visita** (`medico_especialista`, `admin`), en solicitudes
  `cita_asignada`. Tras confirmar, el sistema abre la pantalla
  **Visitas**.
- **Cancelar** (`medico_general`, `admin`), mientras la solicitud no
  esté completada. Pide confirmación y no se puede deshacer.

[CAPTURA: pantalla Solicitudes médicas con la "Bandeja" en distintos estados y la tarjeta "Nueva solicitud"]

[CAPTURA: ventana del navegador pidiendo la fecha al usar "Asignar cita"]

**RN-02.** Si se intenta crear una segunda solicitud activa para el
mismo paciente y la misma especialidad, el sistema responde: *"Ya
existe una solicitud activa para el paciente X en la especialidad Y"*.

### 4.4 Visitas médicas

**Quién la ve:** los mismos perfiles que Solicitudes.
**Quién escribe:** `medico_especialista`, `admin`.

1. En la tarjeta **Elegir visita**, abrir la lista **Visita** y
   escoger una. Cada opción muestra paciente, especialidad y estado.
   Las visitas nacen al usar **Iniciar visita** en la bandeja de
   solicitudes.
2. Aparece el detalle *Visita #N* con su etiqueta de estado y cuatro
   bloques:
   - **Notas clínicas**: **Diagnóstico** y **Observaciones**, y el
     botón **Guardar cambios**.
   - **Exámenes solicitados**: escribir el tipo en **Nuevo examen** y
     presionar **Agregar examen**. Laboratorio lo recibe de inmediato.
   - **Prescripciones**: elegir **Medicamento del inventario** (el
     campo **Nombre y presentación** se completa solo), escribir
     **Dosis** e **Indicaciones**, y presionar **Agregar
     prescripción**. Si no se elige un medicamento del inventario,
     farmacia no podrá dispensarla (RN-06).
   - **Cerrar visita**: botón **Marcar visita como completa**.
3. Para cerrar, diagnóstico y observaciones no pueden estar vacíos. Al
   cerrar, la solicitud enlazada pasa a `completada` y todos los
   campos de la visita quedan bloqueados.

[CAPTURA: detalle de una visita en atención con Notas clínicas, Exámenes solicitados y Prescripciones]

[CAPTURA: la misma visita ya completada, con los campos bloqueados]

### 4.5 Farmacia

**Quién la ve:** `farmacia`, `enfermero`, `medico_especialista`,
`admin`. **Quién dispensa:** `farmacia`, `admin`.

A la izquierda, **Inventario**: medicamento, presentación, stock y
precio. Un stock menor a 20 unidades se marca con la etiqueta *bajo*.

A la derecha, **Dispensar contra prescripción**:

1. Elegir **Paciente**.
2. En **Prescripción pendiente** aparecen las que emitió el médico en
   una visita. Si no hay ninguna, el sistema lo indica y el botón
   queda bloqueado. Una prescripción marcada *(sin medicamento de
   inventario)* no se puede dispensar: el especialista debe emitir
   otra eligiendo el medicamento del inventario.
3. Escribir **Cantidad a entregar** y presionar **Dispensar**.
4. El sistema descuenta el inventario y muestra el costo con el 20 %
   de descuento de la fundación (RN-09).
5. La prescripción queda `dispensada` y no se puede repetir.

Abajo, **Historial del paciente seleccionado** muestra sus
dispensaciones anteriores y el total.

[CAPTURA: pantalla Farmacia con "Inventario", "Dispensar contra prescripción" y el historial]

### 4.6 Laboratorio

**Quién la ve:** `laboratorio`, `medico_especialista`, `enfermero`,
`admin`. **Quién registra:** `laboratorio`, `admin`.

A la izquierda, **Órdenes pendientes**: número, paciente, examen y
fecha. Cada fila tiene dos acciones:

- **Seleccionar** — copia el número al formulario de la derecha.
- **Ver costo** — abre una ventana con precio base, descuento de la
  fundación y total a facturar.

A la derecha, **Registrar resultado**:

1. **Número de examen** (se llena con **Seleccionar**).
2. **Tipo de resultado**: Texto (interpretación), Numérico, Archivo
   adjunto o Mixto.
3. Completar **Interpretación / texto**, **Valor numérico** o
   **Archivo adjunto (URL)** según el tipo.
4. Presionar **Registrar resultado**. La orden sale de la lista y en
   la visita aparece como `disponible`.

Cuando no queda nada por procesar la tabla muestra *No hay órdenes
pendientes*.

[CAPTURA: pantalla Laboratorio con una orden pendiente y el formulario "Registrar resultado"]

### 4.7 Financiero

**Quién la ve:** `coordinador_fundacion`, `fundacion`, `admin`.
**Quién registra:** solo `admin`.

- **Estado de cuenta.** Elegir **Paciente**. Aparecen cuatro
  indicadores — **Saldo total**, **Cargos por servicios**, **Cuotas
  pendientes** y **Último movimiento** — y las tablas **Cargos** y
  **Cuotas**. Si el saldo supera el umbral configurado (Q1000 por
  defecto), la tarjeta de saldo muestra el aviso; si no, dice *Sin
  alertas*.
- **Registrar cargo.** Paciente, **Concepto** y **Monto (Q)**; botón
  **Registrar cargo**.
- **Registrar / pagar cuota.** Paciente, **Mes**, **Año** y **Monto
  (Q)**; botón **Registrar pago**. Si la cuota de ese mes no existía,
  se crea y se marca pagada en un solo paso.
- **Donaciones.** Tabla con las donaciones registradas. En **Nueva
  donación**, guardar primero al donante con **Guardar donante** y
  luego elegirlo, escribir monto, tipo (Dinero, Bienes, Otro) y
  concepto, y presionar **Registrar donación**.

Los gastos operativos y los pagos a la fundación todavía no tienen
formulario en pantalla: se registran por la API del servicio
financiero y aparecen en los reportes.

[CAPTURA: "Estado de cuenta" de un paciente con saldo pendiente y las tablas Cargos y Cuotas]

[CAPTURA: formularios "Registrar cargo", "Registrar / pagar cuota" y "Nueva donación"]

### 4.8 Reportes

**Quién la ve:** todos.

1. En **Generar reporte**, elegir el **Reporte**: Entradas de dinero,
   Cobros por rango de fecha, Pagos a la fundación, Costos por
   paciente, Análisis médico, Exámenes solicitados o Medicamentos
   aplicados.
2. Revisar **Desde** y **Hasta**. Al cambiar de reporte el rango se
   ajusta solo: mes en curso para los financieros, últimos 30 días
   para exámenes y medicamentos, últimos 90 días para costos por
   paciente y análisis médico.
3. Presionar **Ver en pantalla**, **Descargar PDF** o **Descargar
   Excel**.

El resultado en pantalla aparece en una tarjeta con el título del
reporte, el período, la cantidad de filas y, cuando aplica, una fila
de totales.

[CAPTURA: pantalla Reportes con "Entradas de dinero" en pantalla y su fila de total]

[CAPTURA: PDF descargado de un reporte]

---

## 5. Reglas de negocio que el sistema aplica (nombres SQA)

- **RN-02**: no se permiten dos solicitudes activas para el mismo
  paciente y especialidad.
- **RN-06**: no se puede despachar un medicamento sin una prescripción
  válida y pendiente, asociada a un medicamento del inventario.
- **RN-09**: todas las ventas (farmacia y laboratorio) a residentes
  del asilo llevan 20 % de descuento de la fundación.
- Completar una visita exige diagnóstico y observaciones no vacíos.
- Estados `completada` y `cancelada` son definitivos.

Si el sistema rechaza una operación, muestra el motivo en un mensaje
**Error —** bajo el botón correspondiente.

---

## 6. Diagrama de componentes del sistema

Ver [COMPONENTES.mmd](COMPONENTES.mmd) para el diagrama renderizable
en Mermaid.

[CAPTURA: diagrama de componentes renderizado]

---

## 7. Preguntas frecuentes

**No veo una sección en el menú.**
El menú solo muestra lo que su perfil utiliza (ver 2.2). Si necesita
otra sección, pídala a administración.

**Hice un cambio y la pantalla se ve igual que antes.**
Recargar la página (F5). Los datos se vuelven a leer cada vez que se
entra a una sección.

**¿Qué pasa si el correo al familiar falla?**
La solicitud se crea igual. El servicio de notificaciones reintenta
automáticamente hasta 3 veces con esperas crecientes. Un `admin`
puede forzar un reintento manual desde los endpoints de
notificaciones.

**¿Puedo editar un paciente ya dado de alta?**
Todavía no desde la pantalla. La corrección se hace por la API de
pacientes (`PUT /api/pacientes/:id`); pedirla a administración.

**¿Cómo cambio los precios de los exámenes?**
Hoy están en la tabla `examenes_precios`. Pendiente: pantalla de
administración para gestionarlos desde el frontend.

**¿Se puede exportar un reporte a Word?**
No directamente. El PDF se puede abrir en Word para edición manual.
