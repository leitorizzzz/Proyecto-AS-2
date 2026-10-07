# Scripts del proyecto

## `seed-demo.js`

Carga datos de ejemplo coherentes contra los microservicios. Idempotente.

### Requisitos

- El stack docker-compose debe estar arriba.
- El admin inicial debe existir. Si todavía no lo creaste:
  ```
  docker compose exec auth-service npm run seed
  ```

### Correr

```bash
# Desde la raíz del repo, apuntando a localhost
npm run seed:demo

# Apuntando a otro host (ej. el servidor Debian via Tailscale)
BASE_HOST=100.96.172.77 npm run seed:demo
```

### Credenciales de los usuarios de demo

Todos con la misma password: **`Demo1234`**.

| Rol | Email |
|---|---|
| admin | `admin@asilo.gt` (creado por `npm run seed` del auth-service, password `Admin12345`) |
| medico_general | `medico.general@asilo.gt` |
| medico_especialista | `especialista@asilo.gt` |
| coordinador_fundacion | `coordinador@asilo.gt` |
| enfermero | `enfermeria@asilo.gt` |
| farmacia | `farmacia@asilo.gt` |
| laboratorio | `laboratorio@asilo.gt` |

### Qué siembra

- 6 pacientes con `familiarEmail` real para disparar notificaciones.
- 2 medicamentos extra (Metformina, Levotiroxina) además de los que ya
  trae el bootstrap de `farmacia-service` (Paracetamol, Losartan,
  Amoxicilina).
- 1 solicitud en cada estado del flujo: `pendiente_asignacion`,
  `cita_asignada`, `en_atencion`, `completada`, `cancelada`.
- 1 visita completada con examen + prescripción.
- 1 donante + 1 donación de Q2500.
- 1 cargo Q450 + 1 cuota del mes en curso Q800 (pagada).
- 1 gasto operativo Q1200 + 1 pago a fundación Q3500.
- Si hay un examen pendiente, le registra un resultado.

### Qué NO modifica

- Password del admin, para no romper credenciales de producción.
- Esquema de base de datos (eso lo hace cada servicio al arrancar).
- Datos ya existentes con el mismo identificador (`email` de usuario,
  `dpi` de paciente, nombre de medicamento, concepto de donación/gasto,
  combinación paciente+especialidad+estado de solicitud).

## `run-all-tests.sh` / `run-all-tests.ps1`

Corre la suite Jest completa (unitaria + supertest). No necesita que
docker-compose esté arriba. Ver `docs/PLAN_PRUEBAS.md`.
