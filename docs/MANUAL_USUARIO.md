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
| `admin` | Las ocho, más **Usuarios** y **Auditoría** | Desactivar y reactivar pacientes, medicamentos, donantes y cuentas; crear cuentas; pacientes, asignar y cancelar citas, dispensar, resultados de laboratorio, toda la caja (cargos, cuotas, donaciones, gastos, pagos a la fundación) y precios de exámenes. No crea solicitudes ni escribe en visitas: eso es solo del médico general y del especialista. |
| `enfermero` | Panel, Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Reportes | Registrar y editar pacientes. |
| `medico_general` | Panel, Pacientes, Solicitudes, Visitas, Reportes | Crear y cancelar solicitudes. |
| `coordinador_fundacion` | Panel, Pacientes, Solicitudes, Visitas, Financiero, Reportes | Asignar cita a las solicitudes. |
| `medico_especialista` | Panel, Pacientes, Solicitudes, Visitas, Farmacia, Laboratorio, Reportes | Iniciar visitas, notas clínicas, exámenes, prescripciones, cerrar la visita. |
| `laboratorio` | Panel, Pacientes, Laboratorio, Reportes | Resultados de exámenes. |
| `farmacia` | Panel, Pacientes, Farmacia, Reportes | Dispensar prescripciones pendientes. |

En **Laboratorio**, enfermería y el médico especialista ven el catálogo
de precios, pero no las órdenes pendientes (solo las ve laboratorio).

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
  | `activo` | ● | línea fina verde |
  | `desactivado` | ⊘ | punteada gris; la fila se ve atenuada |

- **Mensajes.** Después de cada acción aparece un mensaje bajo el
  botón, que empieza con **Ok —**, **Aviso —** o **Error —**.
- **Ventanas de confirmación.** Las acciones que cambian un estado
  (asignar cita, iniciar visita, cancelar, cerrar visita) y la edición
  de pacientes y precios se hacen en una ventana sobre la pantalla. La
  ventana se cierra con **Cancelar**/**Volver** o con la tecla **Esc**
  sin guardar nada. Si el sistema rechaza la acción, el motivo aparece
  dentro de la misma ventana como **Error —** y se puede corregir sin
  volver a empezar.

[CAPTURA: ventana "Asignar cita" con fecha, hora y médico especialista]

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
botón. Si la cuenta fue desactivada por administración, el mensaje es
*Cuenta desactivada. Pida a administración que la reactive.*

**Importante.** La sesión dura 8 horas. Pasado ese tiempo el sistema
pide volver a iniciar sesión. Para salir antes, usar **Cerrar sesión**
al pie del menú lateral.

**Cierre por inactividad.** Si durante **30 minutos** no se usa el
teclado, el mouse ni la pantalla táctil, la sesión se cierra sola. Un
minuto antes aparece la ventana *Su sesión está por cerrarse* con una
cuenta regresiva: presionar **Seguir trabajando** (o la tecla Esc) para
continuar. Si se cierra, la pantalla de inicio muestra *Sesión cerrada
por inactividad*. Cuenta la actividad en cualquier pestaña del sistema
abierta en el mismo navegador.

[CAPTURA: ventana "Su sesión está por cerrarse" con la cuenta regresiva]

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

- **Pacientes registrados** (tarjeta oscura, a la izquierda) — solo
  los activos.
- **Solicitudes activas** — pendientes, con cita o en atención.
- **Visitas abiertas** — solicitudes en atención.
- **Alertas de cobro** — cuántas cuentas están en rojo, y debajo cuántas
  en rojo (▲) y en naranja (◆). Solo lo ven administración y
  coordinación de fundación; para los demás muestra *—*.

Para administración y coordinación aparece la tarjeta **Alertas de
cobro**: una fila por cuenta con alerta, primero las rojas, con
**Nivel**, **Paciente**, **Motivo**, **Cuotas vencidas**, **Mora máx.**
(días) y **Saldo**.

- ▲ **Roja**: el saldo llega al umbral (Q1000 por defecto) o una cuota
  lleva más de 30 días vencida.
- ◆ **Naranja**: el saldo pasa de la mitad del umbral o hay alguna
  cuota vencida.

Una cuota vence el último día de su mes (o la fecha indicada al
emitirla); desde el día siguiente cuenta la mora. Al pagarla, la alerta
desaparece.

La tarjeta **Mis avisos** muestra las notificaciones internas para la
persona que inició sesión, por ejemplo *Cita asignada* cuando la
coordinación agenda una solicitud suya (médico general) o de un
paciente que acompaña (enfermería). Los no leídos se marcan; **Marcar
leído** los quita del contador.

Debajo, la tarjeta **Solicitudes recientes** lista las últimas ocho
con paciente, especialidad, estado y fecha de creación.

[CAPTURA: Panel con los cuatro indicadores, "Alertas de cobro" y "Mis avisos"]

### 4.2 Pacientes

**Quién la ve:** todos. **Quién registra y edita:** `enfermero`,
`admin`.

Arriba, la tarjeta **Residentes** lista a cada paciente activo con el
correo de su familiar, DPI, fecha de nacimiento, fecha de ingreso,
**Estado** y, para enfermería y administración, las acciones **Editar**
y **Familiar**.

Debajo, la tarjeta **Registrar paciente**:

| Campo | Notas |
|---|---|
| **Nombres**, **Apellidos** | Obligatorios. |
| **Fecha de nacimiento** | Obligatoria. |
| **Género** | Femenino, Masculino u Otro. |
| **DPI (13 dígitos)** | Obligatorio y único. |
| **Teléfono**, **Contacto de emergencia** | Opcionales. |
| **Dirección**, **Padecimientos conocidos** | Opcionales. |

Bloque **Familiar responsable (titular de la cuenta)** — todos los
campos son obligatorios: **Nombres**, **Apellidos**, **DPI (13
dígitos)**, **Parentesco**, **Teléfono**, **Correo (recibe los
avisos)** y **Dirección**. Esta persona es a quien se le cargan los
servicios y a cuyo correo llegan los avisos automáticos.

Presionar **Registrar paciente**. Junto con el paciente se registran
su familiar responsable y su **ficha médica**. Si falta un dato del
familiar, el sistema dice cuáles y no guarda; si ya existe otro
paciente con el mismo DPI, muestra el motivo y no guarda.

**Corregir el familiar.** Presionar **Familiar** en la fila del
paciente: se abre una ventana con los datos del familiar responsable;
corregir y guardar. Mientras al familiar le falte un dato no se le
pueden registrar cargos ni cuotas, ni cerrar visitas de ese paciente.

Para los demás perfiles el botón dice *Registro no permitido para su
rol* y los campos están bloqueados.

**Editar un expediente.** Presionar **Editar** en la fila del paciente.
Se abre la ventana *Editar expediente* con los datos del paciente ya
llenos (el familiar se corrige con **Familiar**); corregir lo necesario
y presionar **Guardar cambios**. Las mismas
reglas aplican: DPI de 13 dígitos y no repetido con otro paciente.

**Desactivar y reactivar** (solo `admin`). Los pacientes no se borran:
se desactivan. Presionar **Desactivar** en la fila y confirmar en la
ventana *Desactivar paciente* (botón rojo **Desactivar**; **Volver**
sale sin cambios). El paciente deja de aparecer en los listados y en
los selectores, y el sistema rechaza crearle solicitudes, asignarle
citas, iniciarle visitas, pedirle exámenes, prescribirle o dispensarle
medicamentos, con el mensaje *El paciente … está desactivado*. Su
historial (solicitudes, visitas, dispensaciones, cuenta) se conserva.

Para verlo de nuevo, marcar **Ver también desactivados** (solo
administración) sobre la tabla: aparece con la etiqueta *desactivado*,
la fila atenuada y la acción **Reactivar**.

[CAPTURA: pantalla Pacientes con la tabla "Residentes" y el formulario "Registrar paciente"]

[CAPTURA: ventana "Editar expediente" de un paciente]

[CAPTURA: tabla "Residentes" con "Ver también desactivados" marcado y un paciente desactivado]

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

**Crear una solicitud** (solo `medico_general`):

1. En **Nueva solicitud**, elegir **Paciente**.
2. Elegir **Enfermero(a) que acompaña** (obligatorio).
3. Escribir **Especialidad** (el campo sugiere cardiologia,
   neurologia, geriatria, etc.) y **Motivo**.
4. Presionar **Crear solicitud**. Queda en `pendiente_asignacion`.

El sistema envía automáticamente un correo al familiar responsable. Si el envío falla, la solicitud se crea igual
y el sistema reintenta solo.

**Acciones de la bandeja** (columna *Acciones*; solo aparecen las que
su perfil puede usar):

- **Asignar cita** (`coordinador_fundacion`, `admin`), en solicitudes
  `pendiente_asignacion`. Se abre la ventana *Asignar cita* con el
  paciente y la especialidad como título: elegir **Fecha de la cita**
  (por defecto, mañana), **Hora** (por defecto 10:00) y **Médico
  especialista** de la lista del personal registrado, y presionar
  **Asignar cita**. El médico general que la creó y el enfermero(a)
  asignado reciben el aviso en **Mis avisos**.
- **Iniciar visita** (`medico_especialista`), en solicitudes
  `cita_asignada`. La ventana *Iniciar visita* pide confirmar; al
  presionar **Iniciar visita** el sistema abre la pantalla **Visitas**
  con la visita nueva ya seleccionada.
- **Cancelar** (`medico_general`, `admin`), mientras la solicitud no
  esté completada. La ventana *Cancelar solicitud* advierte que no se
  puede deshacer; el botón rojo **Cancelar solicitud** confirma y
  **Volver** sale sin cambios.

[CAPTURA: pantalla Solicitudes médicas con la "Bandeja" en distintos estados y la tarjeta "Nueva solicitud"]

[CAPTURA: ventana "Cancelar solicitud" con el botón rojo]

**RN-02.** Si se intenta crear una segunda solicitud activa para el
mismo paciente y la misma especialidad, el sistema la rechaza e indica
el número y el estado de la solicitud activa que lo impide.

### 4.4 Visitas médicas

**Quién la ve:** los mismos perfiles que Solicitudes.
**Quién escribe:** solo `medico_especialista`.

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
     El campo sugiere los exámenes del catálogo de precios: solo se
     pueden pedir exámenes con precio, y el costo con el descuento de la
     fundación queda registrado en ese momento (se ve bajo el examen).
     Cuando laboratorio registra el resultado, el examen pasa a
     `disponible` y aparece **Ver resultado**.
   - **Prescripciones**: elegir **Medicamento del inventario** (el
     campo **Nombre y presentación** se completa solo), escribir
     **Cantidad prescrita (unidades)**, **Dosis** e **Indicaciones**, y
     presionar **Agregar prescripción**. Si no se elige un medicamento
     del inventario, farmacia no podrá dispensarla (RN-06). Cada
     prescripción indica cuánto se ha entregado (*entregado x de y*).
   - **Cerrar visita**: botón **Marcar visita como completa**.
3. Para cerrar, presionar **Marcar visita como completa** y confirmar
   en la ventana *Cerrar visita* con **Marcar como completa**. El
   sistema usa el diagnóstico y las observaciones **guardados**: si se
   cambiaron, presionar antes **Guardar cambios**. Si alguno está vacío,
   la visita queda `incompleta`, el campo que falta se marca con borde,
   fondo y el texto *✕ Obligatorio para cerrar*; completarlo, guardar y
   volver a cerrar. Al cerrar, la solicitud enlazada pasa a
   `completada`, todos los campos de la visita quedan bloqueados y el
   sistema genera **en el mismo paso** el cargo al familiar: consulta
   del especialista, exámenes y medicamentos entregados, cada uno con el
   20 % de descuento. El mensaje muestra el total por rubro. Una visita
   no se puede cobrar dos veces.

[CAPTURA: detalle de una visita en atención con Notas clínicas, Exámenes solicitados y Prescripciones]

[CAPTURA: visita incompleta con los campos faltantes resaltados]

[CAPTURA: la misma visita ya completada, con los campos bloqueados y el cargo generado]

### 4.5 Farmacia

**Quién la ve:** `farmacia`, `enfermero`, `medico_especialista`,
`admin`. **Quién dispensa:** `farmacia`, `admin`.

Arriba, **Inventario**: medicamento, presentación, stock, precio y
**Estado**. Un stock menor a 20 unidades se marca con la etiqueta *bajo*.
Farmacia y administración pueden **Desactivar** un medicamento (ventana
de confirmación): sale del inventario visible, ya no se puede prescribir
ni dispensar, y sus dispensaciones anteriores se conservan. Solo
administración ve los desactivados (**Ver también desactivados**) y
puede **Reactivarlos**.

Debajo, **Dispensar contra prescripción**:

1. Elegir **Paciente**.
2. En **Prescripción pendiente** aparecen las que emitió el médico en
   una visita. Si no hay ninguna, el sistema lo indica y el botón
   queda bloqueado. Una prescripción marcada *(sin medicamento de
   inventario)* no se puede dispensar: el especialista debe emitir
   otra eligiendo el medicamento del inventario.
3. Escribir **Cantidad a entregar** (la lista indica *faltan N de M*)
   y presionar **Dispensar**. Se puede entregar por partes.
4. El sistema descuenta el inventario y muestra el costo con el 20 %
   de descuento de la fundación (RN-09), que se suma a la visita. Si el
   paciente o el medicamento están desactivados, o se pide más de lo
   que falta, rechaza la dispensación sin tocar el inventario.
5. Mientras falte entregar, la prescripción queda `parcial`; al
   completar la cantidad pasa a `dispensada` y no admite más. Lo que se
   entrega después de cerrada la visita genera un cargo aparte.

Abajo, **Historial del paciente seleccionado** muestra sus
dispensaciones anteriores y el total.

[CAPTURA: pantalla Farmacia con "Inventario", "Dispensar contra prescripción" y el historial]

### 4.6 Laboratorio

**Quién la ve:** `laboratorio`, `medico_especialista`, `enfermero`,
`admin`. **Quién registra resultados:** `laboratorio`, `admin`.
**Quién cambia precios:** `admin`.

A la izquierda, **Órdenes pendientes**: número, paciente, examen y
fecha. Solo laboratorio y administración ven las órdenes; los demás
perfiles ven un aviso en su lugar. Cada fila tiene dos acciones:

- **Seleccionar** — copia el número al formulario de la derecha.
- **Ver costo** — abre la ventana *Costo del examen* con precio base,
  descuento de la fundación y total a facturar: el costo registrado al
  pedir el examen, aunque después cambie el catálogo.

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

[CAPTURA: ventana "Costo del examen" con precio base, descuento y total]

**Precios de exámenes.** Abajo, la tabla **Precios de exámenes** muestra
cada examen con su **Precio base** y el precio **Con descuento** que paga
el residente (RN-09). Administración puede:

- Agregar uno nuevo en **Nuevo precio**: **Examen** y **Precio base
  (Q)**, botón **Agregar precio**. Un examen ya existente se rechaza.
- Cambiarlo con **Editar** en su fila: ventana *Editar precio*, botón
  **Guardar precio**.

El nombre del examen debe coincidir exactamente con el que el
especialista pide en la visita; por eso la visita sugiere los nombres
del catálogo.

[CAPTURA: tabla "Precios de exámenes" y formulario "Nuevo precio"]

### 4.7 Financiero

**Quién la ve:** `coordinador_fundacion`, `fundacion`, `admin`.
**Quién registra:** solo `admin`.

- **Estado de cuenta.** Elegir **Paciente**. Arriba se ve el **titular
  de la cuenta** (familiar responsable con DPI, teléfono y correo).
  Aparecen cuatro indicadores — **Saldo total**, **Cargos por
  servicios**, **Cuotas pendientes** y **Último movimiento** — y las
  tablas **Cargos** (con el desglose de consulta, laboratorio y
  farmacia de cada visita) y **Cuotas** (con su vencimiento y, si
  corresponde, *vencida N d*). La tarjeta de saldo muestra la alerta
  ▲ roja o ◆ naranja con su motivo, o *Sin alertas*.
- **Abonar.** En la tabla **Cargos**, **Abonar** abre una ventana con
  el saldo del cargo; el sistema no acepta abonos mayores al saldo.
- **Registrar cargo.** Paciente, **Concepto** y **Monto (Q)**; botón
  **Registrar cargo**. Si el familiar responsable está incompleto, el
  sistema lo rechaza.
- **Emitir / pagar cuota.** Paciente, **Mes**, **Año**, **Monto (Q)** y,
  opcional, **Vence**. **Emitir pendiente** crea la cuota sin pagarla
  (vence el último día del mes si no se indica otra fecha); si vence sin
  pago entra a las alertas. **Registrar pago** la paga, y si no existía
  la crea y la marca pagada en un solo paso.
- **Donaciones.** Tabla con las donaciones registradas. En **Nueva
  donación**, guardar primero al donante con **Guardar donante** y
  luego elegirlo, escribir monto, tipo (Dinero, Bienes, Otro) y
  concepto, y presionar **Registrar donación**.

- **Gastos operativos.** Tabla con los gastos registrados. En
  **Registrar gasto**: **Concepto**, **Categoría** (Servicios,
  Mantenimiento, Personal, Alimentación, Medicamentos, Otros) y **Monto
  (Q)**; botón **Registrar gasto**.
- **Pagos a la fundación.** Tabla con los pagos realizados. En
  **Registrar pago a la fundación**: **Concepto** y **Monto (Q)**; botón
  **Registrar pago**.

Los pagos a la fundación aparecen también en el reporte *Pagos a la
fundación*. Los gastos operativos solo se consultan en esta tabla:
ninguno de los siete reportes los incluye.

[CAPTURA: "Estado de cuenta" de un paciente con saldo pendiente y las tablas Cargos y Cuotas]

[CAPTURA: formularios "Registrar cargo", "Emitir / pagar cuota" y "Nueva donación"]

[CAPTURA: tarjetas "Gastos operativos" y "Pagos a la fundación" con sus formularios]

**Donantes.** La tarjeta **Donantes** lista a los donantes con teléfono,
correo, fecha de registro y **Estado**. Administración puede
**Desactivar** un donante: deja de aparecer en el selector de **Nueva
donación** y el sistema rechaza registrarle donaciones; las anteriores
se conservan. Con **Ver también desactivados** se ve y se puede
**Reactivar**.

[CAPTURA: tarjeta "Donantes" con un donante desactivado]

### 4.8 Reportes

**Quién la ve:** todos.

1. En **Generar reporte**, elegir el **Reporte**: Entradas de dinero,
   Cobros por rango de fecha, Pagos a la fundación, Costos por
   paciente, Análisis médico, Exámenes solicitados o Medicamentos
   aplicados.
2. Revisar **Desde** y **Hasta**. Ambos días se incluyen completos (un
   rango de hoy a hoy trae todo lo de hoy). Al cambiar de reporte el
   rango se ajusta solo: mes en curso para los financieros, últimos 30
   días para exámenes y medicamentos, últimos 90 días para costos por
   paciente y análisis médico.
3. Presionar **Ver en pantalla**, **Descargar PDF** o **Descargar
   Excel**.

El resultado en pantalla aparece en una tarjeta con el título del
reporte, el período, la cantidad de filas y, cuando aplica, una fila
de totales. **Costos por paciente** muestra lo cobrado por rubro
(consulta, laboratorio, farmacia y otros cargos). El Excel lleva la
cabecera del asilo y los totales como fórmulas, de modo que se
recalculan si se edita una celda.

[CAPTURA: pantalla Reportes con "Entradas de dinero" en pantalla y su fila de total]

[CAPTURA: PDF descargado de un reporte]

---

### 4.9 Usuarios

**Quién la ve:** solo `admin`.

- **Cuentas**: nombre, correo, rol, fecha de registro y **Estado** de
  cada cuenta. **Desactivar** (ventana de confirmación) impide que esa
  persona inicie sesión; lo que registró se conserva con su nombre. Con
  **Ver también desactivadas** aparecen las desactivadas con
  **Reactivar**. La cuenta propia dice *su cuenta*: un administrador no
  puede desactivarse a sí mismo.
- **Nueva cuenta**: **Nombre**, **Correo**, **Contraseña inicial**
  (mínimo 6 caracteres) y **Rol**; botón **Crear cuenta**.

Una persona que ya tenía la sesión abierta cuando se desactivó su
cuenta puede seguir trabajando hasta que la sesión venza (8 horas) o
la cierre; a partir de ahí ya no puede volver a entrar.

[CAPTURA: pantalla Usuarios con la lista de cuentas y el formulario "Nueva cuenta"]

### 4.10 Auditoría

**Quién la ve:** solo `admin`.

Bitácora de quién **creó**, **modificó**, **canceló**, **desactivó** o
**reactivó** cada registro, cuándo, desde qué dirección IP y en qué
módulo: pacientes, familiares, solicitudes (incluida la asignación de
cita), visitas, exámenes, prescripciones, medicamentos, dispensaciones,
cargos, abonos, cuotas, donantes, donaciones, gastos, pagos a la
fundación y cuentas de usuario. Cada registro guarda los datos antes y
después del cambio.

1. Elegir **Desde** y **Hasta** (por defecto, los últimos 7 días) y,
   si se quiere, una **Entidad**.
2. Presionar **Consultar**.

La tabla **Registros** muestra fecha y hora, usuario e IP, módulo,
acción (con su símbolo), entidad con su número, los cambios y un detalle (por ejemplo, la fecha y
hora de la cita asignada). Se muestran como máximo 200 registros, del
más reciente al más antiguo. Laboratorio (resultados y precios) y
notificaciones no se registran en la auditoría.

[CAPTURA: pantalla Auditoría con registros filtrados por entidad]

---

## 5. Reglas de negocio que el sistema aplica (nombres SQA)

- **RN-02**: no se permiten dos solicitudes activas para el mismo
  paciente y especialidad.
- **RN-06**: no se puede despachar un medicamento sin una prescripción
  válida y pendiente, asociada a un medicamento del inventario.
- **RN-09**: todas las ventas (farmacia y laboratorio) a residentes
  del asilo llevan 20 % de descuento de la fundación.
- Todo interno se registra con su familiar responsable completo y su
  ficha médica.
- Una solicitud lleva siempre al enfermero(a) que acompaña.
- Completar una visita exige diagnóstico y observaciones no vacíos; si
  faltan, la visita queda incompleta.
- Al cerrar una visita se genera su cargo una sola vez, con consulta,
  exámenes y medicamentos entregados.
- Ningún saldo puede quedar negativo; no se cargan servicios a un
  familiar con datos incompletos.
- No se pide un examen que no tenga precio en el catálogo.
- Estados `completada` y `cancelada` son definitivos.
- **Paciente activo**: a un paciente desactivado no se le crean
  solicitudes, citas, visitas, exámenes, prescripciones ni
  dispensaciones.
- No se borra nada: pacientes, medicamentos, donantes y cuentas se
  desactivan y se pueden reactivar.

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
Sí, enfermería y administración: **Pacientes** → **Editar** en la fila
del paciente (ver 4.2).

**¿Puedo borrar un paciente?**
No: se desactiva (ver 4.2). Administración lo hace desde **Pacientes**;
el historial se conserva y se puede reactivar en cualquier momento.

**No puedo entrar: "Cuenta desactivada".**
Administración desactivó su cuenta. Pida que la reactiven en
**Usuarios** (ver 4.9).

**Me sacó del sistema sin que cerrara sesión.**
Pasaron 30 minutos sin actividad (ver 3) o venció la sesión de 8 horas.
Vuelva a iniciar sesión; lo guardado no se pierde.

**¿Cómo cambio los precios de los exámenes?**
Administración: **Laboratorio** → **Precios de exámenes** (ver 4.6).

**El costo de un examen dice que no hay precio configurado.**
El nombre del examen pedido en la visita no coincide con ninguno del
catálogo. Administración puede agregarlo en **Nuevo precio** con ese
mismo nombre.

**¿Se puede exportar un reporte a Word?**
No directamente. El PDF se puede abrir en Word para edición manual.
