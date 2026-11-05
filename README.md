# Sistema de Gestión Integral — Asilo "Cabeza de Algodón"

> Proyecto final de **Análisis y Diseño de Sistemas II**
> Universidad Mariano Gálvez de Guatemala — Centro Regional de Mazatenango
> Ing. Angel Atilio Maltez C.

Software para digitalizar la administración del asilo: registro de
residentes, solicitudes de atención a especialistas, visitas médicas
con exámenes y prescripciones, dispensación de medicamentos con el
descuento de la fundación, estado de cuenta, donaciones, gastos y
reportes.

## Arquitectura en 10 líneas

- **7 microservicios Node.js + Express** + un frontend estático
  (HTML/CSS/JS plano servido por nginx), todo en Docker Compose.
- Base de datos única y compartida: **SQL Server** (`AsiloCabezaAlgodon`).
- Cada servicio sigue **4 capas obligatorias**: routes → controllers →
  services → repositories (+ models), sin ORM.
- Autenticación por **JWT HS256** (`auth-service`), verificado por los
  demás con el mismo `JWT_SECRET`. Toda escritura exige un rol concreto
  (`autorizarRoles`); las lecturas quedan abiertas a cualquier usuario
  autenticado salvo las órdenes de laboratorio. Tabla completa en
  [CONTEXT_SISTEMA.md §3.3](CONTEXT_SISTEMA.md).
- Dominio en español, estructura técnica en inglés.
- **Recuperación de contraseña** (RF-42): "¿Olvidaste tu contraseña?" en
  el login → `POST /api/auth/recuperar` (misma respuesta exista o no el
  correo) → enlace por correo de un solo uso, válido 30 min, guardado solo
  como hash → `POST /api/auth/restablecer`. Detalle en
  [auth-service/README.md](auth-service/README.md).
- Comunicación entre servicios **mixta** (ver
  [CONTEXT_SISTEMA.md §4.1](CONTEXT_SISTEMA.md)): HTTP + JWT para
  efectos secundarios (pacientes → notificaciones; notificaciones →
  Brevo); lectura directa de la BD compartida para agregados
  transaccionales (farmacia ↔ `visita_prescripciones`, laboratorio ↔
  `visita_examenes`).
- Reglas de negocio centrales: RN-02 (una solicitud activa por
  paciente+especialidad), RN-06 (dispensación requiere prescripción
  válida), RN-09 (20 % de descuento fundación).
- Idempotencia de esquema: `inicializarEsquema()` con `IF NOT EXISTS`
  y `ALTER` condicional.

## Requisitos

- **Docker Desktop** (Windows) o Docker Engine (Linux) con
  `docker compose`.
- **Node.js 20+** y **npm**.
- En Windows: PowerShell 5+ o Git Bash.

## Obtener el código

```bash
git clone https://github.com/leitorizzzz/Proyecto-AS-2.git
cd Proyecto-AS-2
```

## Arranque en un comando

Con Docker Desktop (o Docker Engine) **ya en marcha**, desde la carpeta del
proyecto:

```powershell
# Windows (PowerShell)
.\scripts\bootstrap.ps1
```

```bash
# Linux / macOS / Git Bash
./scripts/bootstrap.sh
```

El script:
1. Copia `.env.example` → `.env` si no existe.
2. `docker compose up -d --build` (SQL Server + 7 microservicios + nginx).
3. Espera a que los 7 `/health` respondan 200.
4. Siembra el admin inicial.
5. Instala las devDependencies de la raíz (jest, supertest y lo que
   necesitan las pruebas RBAC: express, jsonwebtoken, bcryptjs).
6. Siembra datos de demo (6 pacientes, solicitudes en cada estado,
   visitas, dispensaciones, donaciones).
7. Crea las vistas con los nombres del Análisis.
8. Imprime las URLs y credenciales.

Al terminar, abrir **http://localhost:8090** y entrar con
`admin@asilo.gt` / `Admin12345`.

**Primera corrida:** ~3-5 minutos (descarga imágenes + SQL Server
arranca); verificado el 19 oct 2026 en un clon limpio: 325 s. Siguientes: ~30 s.

## Credenciales de demo

Todas las de rol usan la misma contraseña: **`Demo1234`**.

| Rol | Email |
|---|---|
| admin | `admin@asilo.gt` / `Admin12345` |
| medico_general | `medico.general@asilo.gt` |
| medico_especialista | `especialista@asilo.gt` |
| coordinador_fundacion | `coordinador@asilo.gt` |
| enfermero | `enfermeria@asilo.gt` |
| farmacia | `farmacia@asilo.gt` |
| laboratorio | `laboratorio@asilo.gt` |

Documentado en [scripts/README.md](scripts/README.md).

## Regenerar la base de datos

La base no se versiona: se crea **desde cero** con Docker. SQL Server crea
`AsiloCabezaAlgodon` (servicio `db-init`), cada microservicio crea sus
tablas al arrancar (`CREATE TABLE` / `ALTER` idempotentes), reportes-service
crea las vistas del Análisis y `bootstrap` siembra el admin y los datos de
demo. Para volver a una base limpia con solo datos de demo:

```powershell
docker compose down -v        # BORRA el volumen de SQL Server (solo en un equipo de pruebas)
.scriptsootstrap.ps1        # o ./scripts/bootstrap.sh
```

`npm run seed:demo` es idempotente: puede correrse de nuevo sobre una base
existente sin duplicar registros. Las pruebas de integración (`test:e2e`,
`test:sqa`, `test:ui`, `test:carga`...) crean registros propios
("E2E …", "SQA …", "UI …"); para entregar una base solo con demo, repetir los
dos comandos de arriba.

## Puertos

| Servicio | URL |
|---|---|
| Frontend (nginx) | http://localhost:8090 (también proxy: `/svc/<servicio>/` → cada API, con la IP real del cliente) |
| auth-service | http://localhost:3000 |
| farmacia-service | http://localhost:3001 |
| pacientes-service | http://localhost:3002 |
| laboratorio-service | http://localhost:3003 |
| financiero-service | http://localhost:3004 |
| reportes-service | http://localhost:3005 |
| notificaciones-service | http://localhost:3006 |
| SQL Server (host) | 1433 |

## Desviaciones respecto al Análisis

HTTP sin HTTPS, sesiones que siguen válidas hasta 8 h tras desactivar
una cuenta, Brevo real no verificado, comunicación mixta entre servicios
(BD compartida + HTTP), usuario `sa` para todos los servicios, token en
`localStorage` y otras: lista completa y honesta en
[CLAUDE.md](CLAUDE.md#desviaciones-respecto-al-análisis).

### Nombres del Análisis en la base: son VISTAS

Las tablas tienen los nombres del código (`pacientes`, `visita_examenes`,
`dispensaciones`...). Para inspeccionar la base con los nombres del
Análisis hay **vistas de solo lectura**: `internos`,
`familiares_responsables`, `examenes_laboratorio`, `despachos_farmacia`,
`cargos_servicios_medicos`, `log_notificaciones` y `log_auditoria`. Las crea
reportes-service al arrancar y `bootstrap`
(`docker compose exec -T reportes-service npm run vistas`, que además
muestra cuántas filas tiene cada una). Columnas y estados equivalentes en
[docs/EQUIVALENCIAS.md](docs/EQUIVALENCIAS.md).

```sql
SELECT * FROM examenes_laboratorio WHERE estado = 'pendiente';
SELECT * FROM log_auditoria ORDER BY fecha DESC;
```

## Pruebas

```bash
npm run test:todo        # unitarias + RBAC (415 casos; no requiere el stack)
npm run test:e2e         # recorrido end-to-end por API (62 pasos; solo toca lo que crea)
npm run test:sqa         # 23 casos del plan del SQA contra el stack
npm run test:ui          # 9 casos del SQA desde la interfaz (Playwright headless)
npm run test:hostil      # permisos por rol y validaciones de entrada (370 comprobaciones)
npm run test:integridad  # 20 consultas de consistencia en la BD
npm run test:carga       # rendimiento con USUARIOS=20..50 (< 3 s por petición)
```

Todas salvo `test:todo` necesitan el stack arriba y son **solo para un
equipo local** (crean registros y algunas usan `docker exec`). Detalle en
[docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md) y
[docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md#8-pruebas).

## Estructura del repo

```
Proyecto-AS-2/
├── auth-service/            # JWT + RBAC + semilla de admin
├── pacientes-service/       # 3 dominios: Paciente, Solicitud, VisitaMedica
├── farmacia-service/        # Inventario + dispensación (RN-06, RN-09)
├── laboratorio-service/     # Órdenes y resultados
├── financiero-service/      # Caja, cuotas, donaciones, gastos
├── reportes-service/        # Los 7 reportes (PDF/Excel/JSON)
├── notificaciones-service/  # Brevo + reintentos
├── frontend/                # HTML/CSS/JS, servido por nginx
├── scripts/                 # bootstrap, seed, run-tests, e2e
├── docs/                    # ERD, componentes, manual, plan de pruebas
├── infra/                   # SQL de bootstrap de la BD compartida
├── docker-compose.yml
├── .env.example             # valores de desarrollo listos para arrancar
└── CONTEXT_SISTEMA.md       # fuente de verdad: reglas, roles, tablas
```

## Documentación

- [CONTEXT_SISTEMA.md](CONTEXT_SISTEMA.md) — Contexto completo del sistema, módulos, RBAC, tablas, decisiones.
- [CLAUDE.md](CLAUDE.md) — Resumen operativo rápido (mantenido por el equipo + Claude).
- [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) — Manual de usuario con capturas de cada pantalla.
- [docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md) — Arquitectura, servicios, variables de entorno, base de datos, seguridad, pruebas y despliegue.
- [docs/FALLAS_CONOCIDAS.md](docs/FALLAS_CONOCIDAS.md) — Qué hace y qué no, desviaciones y mensajes de error con qué hacer.
- [docs/ERD.png](docs/ERD.png) ([fuente](docs/ERD.mmd)) — Diagrama entidad-relación de la BD compartida.
- [docs/COMPONENTES.png](docs/COMPONENTES.png) ([fuente](docs/COMPONENTES.mmd)) — Diagrama de componentes del stack.
- [docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md) — Plan de pruebas con tabla ID → test.
- [docs/RESULTADOS_PLAN_SQA.csv](docs/RESULTADOS_PLAN_SQA.csv) y [docs/EQUIVALENCIAS.md](docs/EQUIVALENCIAS.md) — Resultado de los 25 casos del SQA y nombres del plan ↔ código.
- [CHANGELOG.md](CHANGELOG.md) — Cambios por versión.

## Despliegue (servidor Debian)

```bash
git pull origin main
./scripts/bootstrap.sh            # o: docker compose up -d --build
```

Antes del primer despliegue, cambiar en `.env` `MSSQL_SA_PASSWORD` y
`JWT_SECRET` (los de `.env.example` son públicos, solo para desarrollo).
Pasos completos en [docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md#9-despliegue-en-el-servidor-debian).

Accesible por Tailscale (`100.96.172.77`) o red local
(`192.168.1.100`).

### IP en la auditoría (caso 24)

La auditoría guarda la IP del navegador: el nginx del frontend la envía en
`X-Forwarded-For` / `X-Real-IP` y los servicios solo confían en ese nginx.

- **En el servidor Debian** (Docker Engine en Linux) nginx recibe la IP
  real del navegador (Tailscale `100.x.x.x` o LAN `192.168.1.x`), y esa es
  la que queda en `auditoria.ip`.
- **En Docker Desktop (Windows / macOS)** es inevitable ver `172.18.0.1`:
  Docker Desktop reenvía el puerto 8090 desde el anfitrión a través de su
  red virtual, y nginx recibe todas las conexiones desde el gateway de esa
  red. No es un error del sistema. La pantalla de Auditoría lo marca como
  "red interna de Docker". Para verificar la IP real, entre al sistema en
  el Debian desde otro equipo de la red o de Tailscale.

## Versiones y entregas al SQA

- Las versiones siguen **SemVer** (`MAYOR.MENOR.PARCHE`) y cada una queda
  como **tag de git** anotado (`v1.0.0`, …) sobre el commit entregado.
- **El SQA prueba siempre una versión con tag**, no la rama en curso: en
  sus reportes se anota la versión (por ejemplo "v1.0.0") y, para
  reproducir, se usa `git checkout v1.0.0` + `down -v` + `bootstrap`.
- Cada corrección de un caso que el SQA reporta como NO CUMPLIDO va en su
  propio commit con el número de caso ("Caso 14 (SQA): …"), se verifica
  desde la interfaz (`npm run test:ui`) y se anota en
  [docs/RESULTADOS_PLAN_SQA.csv](docs/RESULTADOS_PLAN_SQA.csv).
- Al entregar una nueva ronda: se sube el número (PARCHE si solo corrige
  fallas, MENOR si agrega funciones), se describe en
  [CHANGELOG.md](CHANGELOG.md) (casos corregidos y su commit) y se crea el
  tag.
- Versión actual: **v1.0.0** (entrega final).

## Licencia

Proyecto académico. Uso interno de la universidad.
