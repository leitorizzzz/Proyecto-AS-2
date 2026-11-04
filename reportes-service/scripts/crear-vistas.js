#!/usr/bin/env node
/*
 * Crea (o actualiza) las vistas de solo lectura con los nombres del Analisis
 * y muestra cuantas filas tiene cada una. Idempotente.
 *   docker compose exec -T reportes-service npm run vistas
 * Sale con codigo 1 si alguna vista no se pudo crear (tablas aun no creadas).
 */
require('dotenv').config();
const VistasAnalisisRepository = require('../src/repositories/VistasAnalisisRepository');

(async () => {
  const repo = new VistasAnalisisRepository();
  const { creadas, pendientes } = await repo.crearTodas();
  pendientes.forEach(p => console.log(`  ! ${p.vista}: ${p.motivo}`));
  const filas = await repo.contar().catch(() => ({}));
  creadas.forEach(v => console.log(`  · vista ${v}: ${filas[v] ?? '?'} filas`));
  process.exit(pendientes.length ? 1 : 0);
})().catch(err => { console.error(err.message); process.exit(1); });
