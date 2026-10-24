/**
 * CAPA DE LOGICA DE NEGOCIO — regla de contrasena.
 *
 * Una sola regla para el alta de cuentas y para el restablecimiento por
 * recuperacion (RF-42): asi no pueden divergir. Hoy exige 6 caracteres
 * como minimo (y 72 como maximo, el limite de bcrypt).
 */
const MINIMO = 6;
const MAXIMO = 72;

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < MINIMO) {
    throw Object.assign(new Error(`La password debe tener al menos ${MINIMO} caracteres`), { status: 400 });
  }
  if (Buffer.byteLength(password, 'utf8') > MAXIMO) {
    throw Object.assign(new Error(`La password no puede pasar de ${MAXIMO} bytes`), { status: 400 });
  }
  return password;
}

module.exports = { validarPassword, MINIMO_PASSWORD: MINIMO };
