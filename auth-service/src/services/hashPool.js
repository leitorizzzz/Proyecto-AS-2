const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

/**
 * CAPA DE LOGICA DE NEGOCIO — soporte de AuthService (caso 25).
 *
 * bcryptjs es JavaScript puro: en el hilo principal cada verificacion
 * (~80-100 ms con costo 10) bloquea al servidor y 30 logins simultaneos se
 * atienden en fila (hasta 7 s medidos). Este pool reparte hash/compare
 * entre HASH_HILOS hilos (por defecto, nucleos - 1, entre 1 y 8). Mismo
 * algoritmo y mismo costo: los hashes existentes siguen siendo validos.
 */
class HashPool {
  constructor(tamano = Number(process.env.HASH_HILOS) || Math.min(Math.max(os.cpus().length - 1, 1), 8)) {
    this.tamano = tamano;
    this.hilos = [];
    this.pendientes = new Map();
    this.cola = [];
    this.siguienteId = 1;
  }

  _crearHilo() {
    const w = new Worker(path.join(__dirname, 'hashWorker.js'));
    w.ocupado = false;
    w.on('message', ({ id, resultado, error }) => {
      const tarea = this.pendientes.get(id);
      this.pendientes.delete(id);
      w.ocupado = false;
      if (tarea) error ? tarea.reject(new Error(error)) : tarea.resolve(resultado);
      this._despachar();
    });
    w.on('error', err => {
      // Un hilo caido: se rechazan sus tareas y se reemplaza al despachar.
      for (const [id, t] of this.pendientes) if (t.hilo === w) { t.reject(err); this.pendientes.delete(id); }
      this.hilos = this.hilos.filter(h => h !== w);
      this._despachar();
    });
    w.unref(); // no impide que el proceso (o jest) termine
    this.hilos.push(w);
    return w;
  }

  _despachar() {
    while (this.cola.length) {
      let w = this.hilos.find(h => !h.ocupado);
      if (!w && this.hilos.length < this.tamano) w = this._crearHilo();
      if (!w) return;
      const tarea = this.cola.shift();
      w.ocupado = true;
      tarea.hilo = w;
      this.pendientes.set(tarea.id, tarea);
      w.postMessage({ id: tarea.id, op: tarea.op, args: tarea.args });
    }
  }

  _ejecutar(op, args) {
    return new Promise((resolve, reject) => {
      this.cola.push({ id: this.siguienteId++, op, args, resolve, reject });
      this._despachar();
    });
  }

  hash(password, costo) { return this._ejecutar('hash', [password, costo]); }
  compare(password, hash) { return this._ejecutar('compare', [password, hash]); }
}

module.exports = HashPool;
