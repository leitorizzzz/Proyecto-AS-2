# CONTEXT.md

> **Proyecto Final — Análisis y Diseño de Sistemas II**
> Universidad Mariano Gálvez de Guatemala, Centro Regional de Mazatenango.
> Sistema para Administración del Asilo de Ancianos **"Cabeza de Algodón"**.
>
> Este archivo cubre el **microservicio de Farmacia** (desarrollado de forma individual) y
> el contexto del sistema completo en el que se integra.
> Los puntos marcados **[VERIFICAR]** no están confirmados contra el repositorio.

---

## 1. Alcance

El sistema completo del asilo se compone de varios módulos. Este repositorio contiene:

| Entregable | Estado |
|---|---|
| `farmacia-service` — microservicio de Farmacia | ✅ Funcional |
| Pantalla de login (prototipo UX/UI) | ✅ v1 y v2 en HTML |
| Documento de arquitectura general (3-tier / N-tier híbrido) | ✅ Entregado |
| Entregable UX/UI (análisis, boceto, capturas, presentación) | ✅ Entregado |

Módulos del sistema general con los que Farmacia se relaciona:

- **Visita Médica** — origina la receta que dispara la dispensación.
- **Financiero** — recibe el `costoTotal` de cada dispensación para la cuenta del
  paciente o familiar responsable.

**Nota de QA:** el curso incluye revisión SQA. Cualquier discrepancia entre el documento de
arquitectura, el modelo de capas y el código implementado se considera un hallazgo. La
consistencia entre entregables es un requisito, no una preferencia.

---

## 2. Arquitectura

### 2.1 Modelo de 4 capas (estándar canónico)

El estándar del proyecto es el **modelo de 4 capas** especificado por el catedrático. Toda
documentación, diagrama y código nuevo debe referirse a estas capas con estos nombres:

```
Presentación (API REST) → Lógica de Negocio → Acceso a Datos → Entidades/Modelos
```

- **Presentación** — expone endpoints HTTP con Express. No contiene reglas de negocio:
  recibe la petición, delega al servicio y responde.
- **Lógica de Negocio** — todas las validaciones y reglas del dominio (control de stock,
  cálculo del descuento de la fundación).
- **Acceso a Datos** — patrón Repository. Única capa que ejecuta SQL.
- **Entidades/Modelos** — clases `Medicamento` y `Dispensacion`, sin lógica de negocio ni
  acceso a base de datos.

**Reglas de dependencia:**

- Comunicación estrictamente entre capas adyacentes.
- La Presentación **nunca** llama al repositorio ni a la base de datos directamente.
- La Capa de Entidades no depende de ninguna otra y puede ser referenciada por todas.

> Un documento entregado previamente describía un modelo de 3 capas. Se aclaró que es
> compatible con el de 4 (agrupaba Entidades dentro de Acceso a Datos) y **no será
> revisado**. De aquí en adelante el estándar es el de 4 capas.

### 2.2 Mapeo capa → carpeta

Las carpetas siguen la convención de Node (nombres técnicos en inglés). Esta tabla es el
puente entre el código y la documentación de arquitectura, y conviene mantenerla:

| Capa | Carpeta | Archivos |
|---|---|---|
| 1. Presentación | `src/routes/`, `src/controllers/` | `farmaciaRoutes.js`, `FarmaciaController.js` |
| 2. Lógica de Negocio | `src/services/` | `FarmaciaService.js` |
| 3. Acceso a Datos | `src/repositories/` | `MedicamentoRepository.js`, `DispensacionRepository.js`, `database.js` |
| 4. Entidades/Modelos | `src/models/` | `Medicamento.js`, `Dispensacion.js` |

### 2.3 Arquitectura de despliegue

Híbrido **3-tier / N-tier**, con distribución cloud / on-premise:

```
  Cliente (navegador)                     ← Tier de presentación
          │  HTTP/HTTPS
          ▼
  Servicios de aplicación (Docker)        ← Tier de aplicación
   ├── farmacia-service          ✅
   ├── Visita Médica             ⬜ pendiente / otro responsable
   ├── Financiero                ⬜ pendiente / otro responsable
   └── Autenticación             ⬜ pendiente
          │
          ▼
  Persistencia                            ← Tier de datos
   SQLite       — desarrollo y demo en contenedor
   MySQL / SQL Server / Oracle — definitivo según arquitectura general
```

Destino de despliegue: **Azure** (Container Instance o AKS), con imagen publicada en Azure
Container Registry.

**[VERIFICAR]** Cloudflare Tunnel se usó en algún momento para exponer el servicio sin IP
pública; confirmar si sigue en el plan o quedó descartado frente a Azure.

---

## 3. Lenguajes y tecnologías

| Categoría | Tecnología |
|---|---|
| Lenguaje | JavaScript (Node.js) |
| Framework backend | Express 4 |
| Base de datos (demo) | SQLite vía `better-sqlite3` |
| Base de datos (definitiva) | MySQL, SQL Server u Oracle |
| Frontend de prueba | HTML + CSS + JavaScript vanilla |
| Contenedores | Docker (imagen base `node:20-alpine`) |
| Orquestación | Kubernetes / AKS (pendiente) |
| Entorno de desarrollo | Antigravity (fork de VS Code), Linux |
| Asistencia en el IDE | Claude Code |
| Evidencias y capturas | Playwright |

**Formatos de entregable:** PDF · DOCX · PPTX · HTML · ZIP · PNG

---

## 4. Dependencias principales

De `package.json`:

**Producción**

| Paquete | Versión | Uso |
|---|---|---|
| `express` | ^4.19.2 | Servidor HTTP y enrutamiento |
| `better-sqlite3` | ^11.3.0 | Cliente SQLite, API síncrona |
| `cors` | ^2.8.5 | Peticiones cross-origin desde el frontend |

**Desarrollo**

| Paquete | Versión | Uso |
|---|---|---|
| `nodemon` | ^3.1.4 | Reinicio automático del servidor |

**Scripts:**

```bash
npm start     # node src/app.js
npm run dev   # nodemon src/app.js
```

**Política de dependencias:** mantener el árbol mínimo. Cada dependencia nueva debe
justificarse; el proyecto se evalúa también por claridad, no por cantidad de librerías.

---

## 5. Estructura de carpetas

```
farmacia-service/
├── src/
│   ├── app.js                        # Punto de entrada; ensambla las capas
│   ├── controllers/
│   │   └── FarmaciaController.js     # Presentación: traduce HTTP → servicio
│   ├── routes/
│   │   └── farmaciaRoutes.js         # Presentación: definición de endpoints
│   ├── services/
│   │   └── FarmaciaService.js        # Lógica de negocio (stock, descuento)
│   ├── repositories/
│   │   ├── database.js               # Conexión e inicialización de SQLite
│   │   ├── MedicamentoRepository.js  # Acceso a datos: medicamentos
│   │   └── DispensacionRepository.js # Acceso a datos: dispensaciones
│   └── models/
│       ├── Medicamento.js            # Entidad
│       └── Dispensacion.js           # Entidad
├── public/
│   └── index.html                    # Interfaz web de prueba/demo
├── Dockerfile
├── .dockerignore
├── package.json
├── package-lock.json
├── CONTEXT.md
└── README.md                         # Incluye guion sugerido para el video
```

**[VERIFICAR]** Ubicación de los entregables de UX/UI (`login-v1.html`, `login-v2.html`,
boceto y capturas). Hoy están fuera de este árbol; conviene decidir si viven en una carpeta
`docs/ux-ui/` de este repositorio o en uno aparte.

---

## 6. Endpoints expuestos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio |
| GET | `/api/medicamentos` | Listar inventario |
| GET | `/api/medicamentos/:id` | Obtener un medicamento |
| POST | `/api/medicamentos` | Registrar medicamento |
| PUT | `/api/medicamentos/:id` | Actualizar medicamento |
| DELETE | `/api/medicamentos/:id` | Eliminar medicamento |
| POST | `/api/dispensaciones` | Dispensar medicamento a un paciente |
| GET | `/api/dispensaciones/paciente/:idPaciente` | Historial y total gastado |

---

## 7. Estado actual

### ✅ `farmacia-service` — funcional

Node.js + Express + SQLite implementado con las 4 capas. Incluye:

- CRUD completo de medicamentos
- Dispensación con validación de existencias
- Lógica de descuento de la fundación
- Agregación del historial por paciente
- UI web de demostración (`public/index.html`)
- Dockerfile y README con guion de video

### ✅ Pantalla de login — prototipo UX/UI

- `login-v1.html` — versión inicial, línea base del análisis de usabilidad
- `login-v2.html` — versión mejorada: validación por campo, mensajes de error específicos,
  mostrar/ocultar contraseña, aviso de Bloq Mayús, áreas con nombre real en lugar de
  códigos 1–5, estado de carga, envío con Enter, recuperación de contraseña e identidad
  institucional visible

> **Importante:** la v2 valida credenciales **en el cliente, contra un arreglo hardcodeado,
> solo para la demo**. No es autenticación real y las credenciales son visibles en el JS.
> Debe reemplazarse por una llamada al servicio de autenticación antes de presentarla como
> sistema real. El bloque de "usuarios de prueba" visible en pantalla también debe quitarse.

### Perfiles de usuario del sistema general

| ID | Rol | Alcance |
|---|---|---|
| 1 | Personal médico | Expedientes clínicos, consultas, indicaciones |
| 2 | Laboratorio | Órdenes de examen y registro de resultados |
| 3 | Farmacia | Inventario de medicamentos y despacho |
| 4 | Administración | Registro de residentes, facturación, reportes |
| 5 | Fundación | Donaciones, descuentos y reportes institucionales |

---

## 8. Requisitos / features pendientes

### Prioridad alta

- [ ] **Autenticación y autorización (JWT)** — los endpoints están abiertos, sin control de
      roles (farmacéutico, administrador).
- [ ] **Conectar `login-v2.html` al servicio de autenticación** — sustituir el `setTimeout`
      simulado y el arreglo hardcodeado por la llamada HTTP real, y redirigir al módulo
      según el rol.
- [ ] **Eliminar el bloque de "usuarios de prueba"** del login en cualquier entrega que se
      presente como sistema real.
- [ ] **Migrar de SQLite a MySQL / SQL Server / Oracle** para alinear con la base de datos
      definitiva del sistema completo.
- [ ] **Variables de entorno** para configuración (puerto, ruta de BD) en lugar de valores
      por defecto embebidos.

### Integraciones

- [ ] **Módulo de Visita Médica** — hoy `idVisita` se recibe como dato suelto; falta el
      enlace real cuando exista ese módulo.
- [ ] **Módulo Financiero** — exponer un endpoint o evento para que caja/cobros tome el
      `costoTotal` de cada dispensación.
- [ ] **Estrategia de comunicación entre servicios** — HTTP directo, gateway o cola. Debe
      quedar reflejada en el documento de arquitectura general.

### Infraestructura

- [ ] **Manifiestos de Kubernetes** (`deployment.yaml`, `service.yaml`) para AKS.
- [ ] **Despliegue en Azure** (Container Instance o AKS) — configurar Azure Container
      Registry y publicar la imagen.
- [ ] **Logging y monitoreo** básico para el contenedor en producción.
- [ ] **[VERIFICAR]** `docker-compose.yml` para levantar los servicios juntos, si aplica.

### Calidad

- [ ] **Pruebas automatizadas** — unitarias para `FarmaciaService`, de integración para los
      endpoints.
- [ ] **Validaciones adicionales** — formato de nombre de medicamento, límites de cantidad
      por dispensación, manejo de concurrencia en stock.
- [ ] **Manejo de errores uniforme** — mismo formato de respuesta en todos los endpoints.
- [ ] **Revisión final de consistencia documental** para el SQA.

---

## 9. Convenciones del proyecto

**Idioma:** el dominio va en español (`Medicamento`, `Dispensacion`, `FarmaciaService`,
`/api/medicamentos`). La estructura técnica sigue la convención de Node en inglés
(`controllers`, `routes`, `services`, `repositories`, `models`). No mezclar los dos
registros dentro de un mismo identificador.

**Nombres de archivo:** `PascalCase.js` para clases (`FarmaciaController.js`),
`camelCase.js` para módulos de configuración y rutas (`farmaciaRoutes.js`, `database.js`).

**Nombre institucional:** siempre **"Asilo de Ancianos Cabeza de Algodón"**, completo y con
tildes. No usar variantes abreviadas en documentos ni en la UI.

**Modelo de capas:** siempre el de **4 capas** con los nombres de la sección 2.1. Es el
punto de consistencia más vigilado por el QA. Si se crean carpetas nuevas, actualizar la
tabla de mapeo de la sección 2.2.

**Frontend:** sin frameworks ni CDN. Las pantallas deben funcionar abriéndolas directamente
en el navegador, sin servidor y sin conexión.

**Accesibilidad:** los usuarios incluyen personal de distintas edades y niveles de
familiaridad con la tecnología. Tipografía ≥ 16px en cuerpo, contraste AA, foco visible,
áreas de clic ≥ 44px y mensajes de error que digan qué corregir.

**Entregables:** se prefieren archivos completos y listos para entregar (HTML, DOCX, PDF,
PPTX, ZIP) sobre fragmentos de código para ensamblar a mano.

---

## 10. Pendientes de confirmar

1. Si Cloudflare Tunnel sigue en el plan de despliegue o quedó descartado frente a Azure.
2. Dónde viven los entregables de UX/UI respecto a este repositorio.
3. Puerto por defecto del servicio y si ya está parametrizado.
4. Quién desarrolla los módulos de Visita Médica y Financiero, y qué contrato de API se
   acordó con ellos.
5. Motor definitivo entre MySQL, SQL Server y Oracle.
6. Fechas de entrega de los pendientes de la sección 8.
