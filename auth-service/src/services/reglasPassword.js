/**
 * CAPA DE LOGICA DE NEGOCIO — regla de contrasena (Analisis, RF-42).
 *
 * Una sola regla para el alta de cuentas, el cambio de contrasena y el
 * restablecimiento por recuperacion, para que no puedan divergir:
 *   - minimo 8 caracteres (y maximo 72 bytes, el limite de bcrypt);
 *   - al menos una letra y al menos un numero.
 * El error dice en espanol todo lo que falta, no solo lo primero.
 */
const MINIMO = 8;
const MAXIMO_BYTES = 72;

function faltantesPassword(password) {
  if (typeof password !== 'string' || password === '') return ['la contraseña es obligatoria'];
  const faltan = [];
  if ([...password].length < MINIMO) faltan.push(`al menos ${MINIMO} caracteres`);
  if (!/\p{L}/u.test(password)) faltan.push('al menos una letra');
  if (!/\p{Nd}/u.test(password)) faltan.push('al menos un número');
  if (Buffer.byteLength(password, 'utf8') > MAXIMO_BYTES) faltan.push(`como máximo ${MAXIMO_BYTES} bytes`);
  return faltan;
}

function validarPassword(password) {
  const faltan = faltantesPassword(password);
  if (faltan.length) {
    const texto = faltan[0] === 'la contraseña es obligatoria'
      ? 'La contraseña es obligatoria.'
      : `La contraseña debe tener ${faltan.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`;
    throw Object.assign(new Error(texto), { status: 400, faltan });
  }
  return password;
}

module.exports = { validarPassword, faltantesPassword, MINIMO_PASSWORD: MINIMO };
