/**
 * CAPA DE LOGICA DE NEGOCIO — validacion de valores de entrada del
 * modulo financiero (auditoria SQA, 26 oct).
 *
 * Antes cada metodo validaba el monto con `Number(monto) <= 0`: un texto
 * ("cien") daba NaN, pasaba la validacion y la BD respondia 500 con el
 * mensaje de SQL; un monto enorme rompia el parametro DECIMAL(10,2). Una
 * sola regla para todos los montos, anios, fechas y correos.
 */
const MAX_MONTO = 99999999.99;          // DECIMAL(10,2)
const ANIO_MIN = 2000, ANIO_MAX = 2100;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const error400 = mensaje => Object.assign(new Error(mensaje), { status: 400 });

/** Monto > 0, hasta Q99 999 999.99 y con 2 decimales como maximo. */
function montoValido(valor, campo = 'monto') {
  const m = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0 || m > MAX_MONTO
      || Math.abs(Math.round(m * 100) - m * 100) > 1e-6) {
    throw error400(`${campo} debe ser un número mayor a 0, hasta Q${MAX_MONTO.toLocaleString('en-US')} y con 2 decimales como máximo`);
  }
  return m;
}

/** Entero positivo (ids). */
function idValido(valor, campo) {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isInteger(n) || n <= 0) throw error400(`${campo} debe ser un número entero positivo`);
  return n;
}

function mesValido(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw error400('mes debe estar entre 1 y 12');
  return n;
}

function anioValido(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < ANIO_MIN || n > ANIO_MAX) throw error400(`anio debe estar entre ${ANIO_MIN} y ${ANIO_MAX}`);
  return n;
}

/** YYYY-MM-DD que existe en el calendario (2026-02-30 no pasa). */
function fechaValida(valor, campo) {
  const s = String(valor);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d) || d.toISOString().slice(0, 10) !== s) {
    throw error400(`${campo} debe ser una fecha válida con formato YYYY-MM-DD`);
  }
  return s;
}

/** Texto obligatorio, sin solo espacios y con largo maximo de la columna. */
function textoRequerido(valor, campo, max) {
  const t = valor == null ? '' : String(valor).trim();
  if (!t) throw error400(`${campo} es requerido`);
  if (t.length > max) throw error400(`${campo} no puede pasar de ${max} caracteres`);
  return t;
}

/** Correo opcional: vacio -> null; si viene, con formato valido. */
function correoOpcional(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  const c = String(valor).trim();
  if (c.length > 200 || !CORREO.test(c)) throw error400('email no tiene un formato válido');
  return c;
}

module.exports = { montoValido, idValido, mesValido, anioValido, fechaValida, textoRequerido, correoOpcional, MAX_MONTO };
