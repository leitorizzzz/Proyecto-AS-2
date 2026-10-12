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
  demás con el mismo `JWT_SECRET`. RBAC por rol en cada endpoint.
- Dominio en español, estructura técnica en inglés.
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

## Arranque en un comando

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
5. Instala jest + supertest.
6. Siembra datos de demo (6 pacientes, solicitudes en cada estado,
   visitas, dispensaciones, donaciones).
7. Imprime las URLs y credenciales.

**Primera corrida:** ~3-5 minutos (descarga imágenes + SQL Server
arranca). Siguientes: ~30 s.

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

## Puertos

| Servicio | URL |
|---|---|
| Frontend (nginx) | http://localhost:8090 |
| auth-service | http://localhost:3000 |
| farmacia-service | http://localhost:3001 |
| pacientes-service | http://localhost:3002 |
| laboratorio-service | http://localhost:3003 |
| financiero-service | http://localhost:3004 |
| reportes-service | http://localhost:3005 |
| notificaciones-service | http://localhost:3006 |
| SQL Server (host) | 1433 |

## Pruebas

```bash
npm run test:todo    # suite unitaria + RBAC (45 casos, no requiere stack arriba)
npm run test:e2e     # smoke end-to-end contra el stack (15 pasos)
```

Ambas documentadas en [docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md).

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
- [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) — Manual de usuario (borrador con marcadores de capturas).
- [docs/ERD.mmd](docs/ERD.mmd) — Diagrama entidad-relación de la BD compartida (Mermaid).
- [docs/COMPONENTES.mmd](docs/COMPONENTES.mmd) — Diagrama de componentes del stack.
- [docs/PLAN_PRUEBAS.md](docs/PLAN_PRUEBAS.md) — Plan de pruebas con tabla ID → test.

## Despliegue (servidor Debian)

```bash
git pull origin main
./scripts/bootstrap.sh
```

Accesible por Tailscale (`100.96.172.77`) o red local
(`192.168.1.100`).

## Licencia

Proyecto académico. Uso interno de la universidad.
