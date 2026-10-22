/**
 * Caso 25: bcrypt en hilos de trabajo. Mismo algoritmo y costo que antes
 * (los hashes existentes siguen validos) y los logins simultaneos se
 * verifican en paralelo.
 */
const bcrypt = require('bcryptjs');
const HashPool = require('../src/services/hashPool');

describe('HashPool (bcrypt fuera del hilo principal)', () => {
  const pool = new HashPool(2);

  test('compare acepta un hash bcrypt existente y rechaza la password incorrecta', async () => {
    const hash = await bcrypt.hash('Demo1234', 4);
    expect(await pool.compare('Demo1234', hash)).toBe(true);
    expect(await pool.compare('otra', hash)).toBe(false);
  });

  test('hash produce un bcrypt con el costo pedido, verificable con bcryptjs', async () => {
    const h = await pool.hash('Demo1234', 10);
    expect(h).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare('Demo1234', h)).toBe(true);
  });

  test('muchas verificaciones simultaneas se resuelven todas, sin cruzar resultados', async () => {
    const hash = await bcrypt.hash('clave', 4);
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.compare(i % 2 ? 'clave' : 'mala', hash)));
    expect(r).toEqual(Array.from({ length: 20 }, (_, i) => i % 2 === 1));
    expect(pool.hilos.length).toBeLessThanOrEqual(2);
  });

  test('hash invalido -> la promesa se rechaza o devuelve false, nunca queda colgada', async () => {
    await expect(pool.compare('x', 'no-es-un-hash').catch(() => false)).resolves.toBe(false);
  });
});
