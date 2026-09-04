# Microservicio de Farmacia — Asilo Cabeza de Algodón

Microservicio independiente encargado del **inventario de medicamentos** y la
**dispensación con costos** (aplicando el descuento que la fundación otorga a
los miembros del asilo), como parte del sistema de administración del asilo.

## Arquitectura interna (4 capas, igual que el resto del proyecto)

```
src/
├── controllers/   -> Capa de Presentación (API REST)
│   └── FarmaciaController.js
├── routes/         -> Capa de Presentación (definición de endpoints)
│   └── farmaciaRoutes.js
├── services/       -> Capa de Lógica de Negocio
│   └── FarmaciaService.js   (validaciones, cálculo de descuento, control de stock)
├── repositories/    -> Capa de Acceso a Datos (patrón Repository)
│   ├── database.js
│   ├── MedicamentoRepository.js
│   └── DispensacionRepository.js
└── models/          -> Capa de Entidades / Modelos
    ├── Medicamento.js
    └── Dispensacion.js
```

Base de datos: **SQLite** (archivo `farmacia.db`, se crea solo al iniciar). Se
usó por simplicidad para el demo del microservicio en contenedor; en el
sistema completo se usará MySQL/SQL Server/Oracle como está definido en el
documento de arquitectura general.

## Endpoints principales

| Método | Ruta                                   | Descripción                              |
|--------|-----------------------------------------|-------------------------------------------|
| GET    | /api/medicamentos                       | Listar inventario                        |
| GET    | /api/medicamentos/:id                   | Obtener un medicamento                   |
| POST   | /api/medicamentos                       | Registrar medicamento nuevo              |
| PUT    | /api/medicamentos/:id                   | Actualizar medicamento                   |
| DELETE | /api/medicamentos/:id                   | Eliminar medicamento                     |
| POST   | /api/dispensaciones                     | Dispensar medicamento a un paciente      |
| GET    | /api/dispensaciones/paciente/:idPaciente| Historial y total gastado por paciente   |

Regla de negocio clave: al dispensar, el servicio valida stock disponible y
calcula el costo aplicando **20% de descuento de la fundación**, luego
descuenta el inventario automáticamente.

## Cómo correrlo localmente

```bash
npm install
npm start
# Servidor en http://localhost:3001
# Interfaz de prueba en http://localhost:3001
```

## Cómo construir y correr en Docker

```bash
docker build -t farmacia-service .
docker run -p 3001:3001 farmacia-service
```

## Despliegue en Azure (referencia rápida)

1. Crear un **Azure Container Registry (ACR)** y subir la imagen:
   ```bash
   az acr build --registry <tu-registro> --image farmacia-service:v1 .
   ```
2. Desplegar como **Azure Container Instance** o en un clúster **AKS
   (Kubernetes)** apuntando a esa imagen, exponiendo el puerto 3001.
3. (Opcional) Usar Kubernetes localmente con `kubectl apply` y un manifest
   `deployment.yaml` + `service.yaml` si se prefiere probar antes de subir a
   la nube.

## Guion sugerido para el video (explicación rápida)

1. **Qué hace el microservicio** (30s): inventario de medicamentos y
   dispensación con descuento de fundación, dentro del sistema del asilo.
2. **Arquitectura de 4 capas** (1 min): mostrar las carpetas
   controllers/services/repositories/models y explicar que cada una solo
   habla con su capa adyacente (igual que el resto del proyecto).
3. **Explicación rápida del código** (2 min): mostrar `FarmaciaService.js`
   (regla de negocio del descuento y validación de stock) y
   `MedicamentoRepository.js` (acceso a datos).
4. **Demo en vivo** (1-2 min): abrir la interfaz web, listar medicamentos,
   dispensar uno y mostrar el costo con descuento, intentar dispensar más
   stock del disponible para mostrar el manejo de errores.
5. **Despliegue** (1 min): mostrar `docker build` y `docker run`, o el
   contenedor corriendo en Azure Container Instance / AKS.
6. **Cierre** (15s): cómo este microservicio se integraría al resto del
   sistema (llamado desde el módulo de Visita Médica cuando se receta un
   medicamento).
