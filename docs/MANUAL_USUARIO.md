# Manual de usuario — Sistema Asilo "Cabeza de Algodón"

> Borrador para revisión de SQA. Los marcadores `[CAPTURA: ...]` indican
> dónde deben insertarse pantallazos reales antes de la entrega final.

---

## 1. Introducción

Este sistema digitaliza la administración del Asilo de Ancianos "Cabeza
de Algodón". Permite registrar residentes, generar solicitudes de
atención a especialistas, documentar visitas médicas con sus exámenes y
prescripciones, dispensar medicamentos aplicando el descuento de la
fundación, llevar la caja (donaciones, cuotas, gastos) y generar los
reportes del enunciado.

La interfaz es una aplicación web accesible desde el navegador. No
requiere instalación en la computadora del usuario.

---

## 2. Antes de empezar

### 2.1 Dirección del sistema

En la red del asilo: `http://192.168.1.100:8090`
Fuera del asilo (vía Tailscale): `http://100.96.172.77:8090`

[CAPTURA: ventana del navegador con la URL del sistema]

### 2.2 Perfiles y permisos

| Perfil | Qué puede hacer |
|---|---|
| `admin` | Todo. Crear usuarios, pacientes, cargos, revisar notificaciones, forzar reintentos. |
| `enfermero` | Ver y registrar pacientes, consultar expedientes. |
| `medico_general` | Crear solicitudes de referencia. Cancelar las que creó. |
| `coordinador_fundacion` | Asignar fecha, hora y médico especialista a las solicitudes. |
| `medico_especialista` | Convertir solicitudes en visitas, escribir diagnóstico y observaciones, solicitar exámenes, prescribir medicamentos, cerrar la visita. |
| `laboratorio` | Ver órdenes pendientes y registrar resultados. |
| `farmacia` | Dispensar prescripciones pendientes (aplica descuento del 20 %). |
| `fundacion` | Consulta general. |

Los perfiles antiguos sin sufijo (`medico`, `especialista`,
`fundacion`) existen por compatibilidad con usuarios creados antes del
cambio de nombres.

---

## 3. Iniciar sesión

1. Abrir la dirección del sistema en el navegador.
2. Ingresar correo y contraseña.
3. Presionar **Entrar**.

[CAPTURA: pantalla de login con los campos de correo y contraseña]

**Importante.** El token de sesión dura 8 horas. Pasado ese tiempo el
sistema pide volver a iniciar sesión.

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

Resumen del día: pacientes activos, solicitudes en atención, visitas
abiertas, alertas de saldo.

**Quién usa:** cualquier usuario autenticado.

[CAPTURA: panel con los indicadores principales]

### 4.2 Pacientes

Listado de residentes del asilo y formulario para registrar uno nuevo.

**Quién usa:** enfermero, admin. Lectura: todos.

Campos del formulario:
- `nombres`, `apellidos` (texto, obligatorios)
- `fechaNacimiento` (fecha, obligatorio)
- `genero` (M, F, Otro)
- `dpi` (13 dígitos, único; valida con regex)
- `direccion`, `telefono`
- `contactoEmergencia` (texto libre)
- **`familiarEmail`** (opcional) — a esta dirección llegan las
  notificaciones automáticas cuando se crea una solicitud
- `padecimientos` (texto multilínea)

[CAPTURA: formulario de alta de paciente y la tabla de pacientes]

Al enviar se valida DPI único; si ya existe otro con el mismo DPI el
sistema muestra el mensaje y no guarda.

### 4.3 Solicitudes de referencia

Bandeja de solicitudes de atención a especialista.

**Quién usa:**
- Crear: `medico_general`.
- Asignar fecha / hora / médico: `coordinador_fundacion` o `admin`.
- Convertir en visita: `medico_especialista`.
- Cancelar: `medico_general` o `admin` (sólo mientras no esté completada).

Flujo de estados:

```
pendiente_asignacion → cita_asignada → en_atencion → completada
                                             │
                                             └─ cancelada (en cualquier
                                                punto previo a completada)
```

[CAPTURA: bandeja con solicitudes en distintos estados y los botones de acción]

**RN-02 (regla de negocio importante).** Si se intenta crear una
segunda solicitud activa para el mismo paciente y la misma
especialidad, el sistema responde con el mensaje: *"Ya existe una
solicitud activa para el paciente X en la especialidad Y"*.

Al crear la solicitud, el sistema envía automáticamente un correo al
familiar (si tiene correo registrado). Si Brevo falla, el servicio de
notificaciones reintenta solo.

### 4.4 Visitas médicas

Trabajo clínico sobre una visita abierta.

**Quién usa:** `medico_especialista`.

Pasos:
1. Elegir visita del selector (sólo aparecen las de solicitudes
   convertidas por el especialista).
2. Escribir **diagnóstico** y **observaciones**. Ambos son
   obligatorios para poder cerrar.
3. Agregar **exámenes** (tipo libre; laboratorio los recoge
   automáticamente).
4. Agregar **prescripciones**: elegir el medicamento del inventario
   (requerido para que farmacia pueda despachar — RN-06) + dosis +
   indicaciones.
5. Marcar la visita como completa. La solicitud enlazada pasa
   automáticamente a `completada` y los campos quedan bloqueados.

[CAPTURA: panel de visita con notas clínicas, exámenes y prescripciones]

### 4.5 Farmacia

Inventario de medicamentos + dispensación.

**Quién usa:** `farmacia`, `admin`.

Dispensación paso a paso:
1. Elegir paciente.
2. El sistema muestra sus prescripciones pendientes. Si hay una sin
   `idMedicamento` el sistema avisa que el especialista debe asociarla
   antes.
3. Elegir cantidad y presionar **Dispensar**.
4. El sistema valida RN-06, descuenta el inventario y calcula el
   costo con el 20 % de descuento (RN-09).
5. La prescripción queda `dispensada` y no se puede repetir.

[CAPTURA: pantalla de farmacia con el inventario y el formulario de dispensación]

### 4.6 Laboratorio

Órdenes de examen pendientes + registro de resultados.

**Quién usa:** `laboratorio`, `admin`.

Pasos:
1. Elegir la orden desde la tabla.
2. Seleccionar tipo de resultado: `texto`, `numerico`, `archivo` o
   `mixto`.
3. Completar los campos del tipo elegido.
4. Guardar. La orden en la visita pasa a `disponible`.
5. Opcional: ver el **costo con descuento** antes/después de
   registrar.

[CAPTURA: pantalla de laboratorio con órdenes pendientes]

### 4.7 Financiero

Estado de cuenta por paciente + donaciones + gastos.

**Quién usa:** `admin` (escritura). Lectura: todos.

- **Estado de cuenta:** elige paciente y ve saldos (cargos pendientes
  + cuotas pendientes). Si el saldo total supera el umbral configurado
  (Q1000 por defecto) aparece una **alerta de saldo**.
- **Registrar cargo:** por ejemplo, consulta de especialista.
- **Pagar cuota mensual:** si la cuota del mes/año no existe, se
  crea y se marca pagada en un solo paso.
- **Donaciones:** registrar primero al donante y luego la donación.
- **Gastos operativos** y **pagos a la fundación**: dos tablas más
  (listado + alta).

[CAPTURA: estado de cuenta con la alerta y los formularios]

### 4.8 Reportes

Los siete reportes del enunciado, en pantalla / PDF / Excel.

**Quién usa:** cualquier autenticado.

Tipos disponibles: costos por paciente, análisis médico, cobros por
rango, pagos a fundación, entradas, exámenes, medicamentos aplicados.

Pasos:
1. Elegir tipo de reporte.
2. Ajustar rango de fechas (hay un default razonable por tipo).
3. **Ver en pantalla** / **Descargar PDF** / **Descargar Excel**.

[CAPTURA: pantalla de reportes mostrando el resultado en tabla]

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

Si el sistema rechaza una operación, muestra el motivo en pantalla con
el código de regla cuando aplica.

---

## 6. Diagrama de componentes del sistema

Ver [COMPONENTES.mmd](COMPONENTES.mmd) para el diagrama renderizable
en Mermaid.

[CAPTURA: diagrama de componentes renderizado]

---

## 7. Preguntas frecuentes

**¿Qué pasa si el correo al familiar falla?**
La solicitud se crea igual. El servicio de notificaciones reintenta
automáticamente hasta 3 veces con esperas crecientes. Un
`admin` puede forzar un reintento manual desde los endpoints de
notificaciones.

**¿Puedo editar un paciente ya dado de alta?**
Sí, los campos editables son todos excepto `fechaIngreso`.

**¿Cómo cambio los precios de los exámenes?**
Hoy están en la tabla `examenes_precios`. Pendiente: pantalla de
administración para gestionarlos desde el frontend.

**¿Se puede exportar un reporte a Word?**
No directamente. El PDF se puede abrir en Word para edición manual.
