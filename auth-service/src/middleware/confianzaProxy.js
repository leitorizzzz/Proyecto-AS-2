const dns = require('dns');
const net = require('net');

/**
 * 'trust proxy' de Express (caso 24): solo se confia en el nginx del
 * frontend. Con eso req.ip es la IP que nginx vio del cliente (la que
 * agrega al final de X-Forwarded-For) y un X-Forwarded-For inventado por
 * quien llame directo al puerto del servicio se ignora.
 *
 * TRUST_PROXY_HOST: nombres o IPs de confianza separados por coma
 * (por defecto "frontend", el servicio de docker compose). Los nombres se
 * resuelven al arrancar y cada 30 s (la IP cambia si se recrea el
 * contenedor). Vacio = no se confia en ningun proxy.
 * Copia identica en auth, pacientes, farmacia y financiero.
 */
function normalizar(ip) {
  return String(ip || '').replace(/^::ffff:/, '');
}

function crearConfianzaProxy({
  hosts = process.env.TRUST_PROXY_HOST ?? 'frontend',
  intervaloMs = 30000,
  lookup = dns.lookup
} = {}) {
  const nombres = String(hosts).split(',').map(h => h.trim()).filter(Boolean);
  const fijas = nombres.filter(h => net.isIP(h)).map(normalizar);
  const porResolver = nombres.filter(h => !net.isIP(h));
  let confiables = new Set(fijas);

  const resolver = () => Promise.all(porResolver.map(h => new Promise(ok => {
    lookup(h, { all: true }, (err, dirs) => ok(err ? [] : dirs.map(d => normalizar(d.address))));
  }))).then(listas => { confiables = new Set([...fijas, ...listas.flat()]); });

  const listo = porResolver.length ? resolver() : Promise.resolve();
  if (porResolver.length && intervaloMs > 0) setInterval(resolver, intervaloMs).unref();

  // Express llama con cada salto, del mas cercano (i = 0) al mas lejano:
  // solo el primero puede ser el proxy.
  const confiar = (addr, i) => i === 0 && confiables.has(normalizar(addr));
  confiar.listo = listo;
  confiar.confiables = () => [...confiables];
  return confiar;
}

module.exports = crearConfianzaProxy;
