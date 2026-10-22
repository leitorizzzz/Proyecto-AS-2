const Familiar = require('../models/Familiar');

const DPI_REGEX = /^\d{13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_REGEX = /^[\d\s+-]{8,20}$/;

/**
 * CAPA DE LOGICA DE NEGOCIO — familiar responsable (casos 5 y 20).
 *
 * Devuelve la lista de campos que faltan o no son validos; vacia si esta
 * completo. La usan el alta de pacientes, la edicion del familiar y el
 * cierre de la visita (no se carga a un familiar incompleto).
 */
function camposInvalidosFamiliar(datos) {
  if (!datos) return [...Familiar.CAMPOS_OBLIGATORIOS];
  const f = new Familiar(datos);
  const faltan = Familiar.CAMPOS_OBLIGATORIOS.filter(c => !f[c]);
  if (f.dpi && !DPI_REGEX.test(f.dpi)) faltan.push('dpi (13 digitos)');
  if (f.email && !EMAIL_REGEX.test(f.email)) faltan.push('email (formato)');
  if (f.telefono && !TELEFONO_REGEX.test(f.telefono)) faltan.push('telefono (8 a 20 digitos)');
  return faltan;
}

function asegurarFamiliarCompleto(datos, contexto) {
  const faltan = camposInvalidosFamiliar(datos);
  if (faltan.length) {
    throw Object.assign(
      new Error(`Datos del familiar responsable incompletos${contexto ? ` (${contexto})` : ''}: ${faltan.join(', ')}`),
      { status: contexto ? 409 : 400, camposFaltantes: faltan }
    );
  }
  return new Familiar(datos);
}

module.exports = { camposInvalidosFamiliar, asegurarFamiliarCompleto };
