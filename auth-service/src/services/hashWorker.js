/**
 * Hilo de trabajo del pool de hashing (ver hashPool.js). Ejecuta bcrypt
 * fuera del hilo principal para que varios logins simultaneos se
 * verifiquen en paralelo y no bloqueen al resto de peticiones.
 */
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', async ({ id, op, args }) => {
  try {
    const resultado = op === 'hash'
      ? await bcrypt.hash(args[0], args[1])
      : await bcrypt.compare(args[0], args[1]);
    parentPort.postMessage({ id, resultado });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
