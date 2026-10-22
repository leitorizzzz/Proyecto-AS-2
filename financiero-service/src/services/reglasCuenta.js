/**
 * CAPA DE LOGICA DE NEGOCIO — titular de la cuenta (caso 20).
 * Ningun cargo ni cuota entra a la cuenta si el familiar responsable no
 * tiene datos completos. Misma lista de campos que pacientes-service
 * (services/reglasFamiliar.js); se repite aqui porque cada servicio es
 * independiente.
 */
const CAMPOS = ['nombres', 'apellidos', 'dpi', 'parentesco', 'telefono', 'email', 'direccion'];

function asegurarTitularCompleto(familiar, idPaciente) {
  if (!familiar) {
    throw Object.assign(
      new Error(`El paciente ${idPaciente} no tiene familiar responsable registrado: no se pueden registrar movimientos en su cuenta`),
      { status: 409 }
    );
  }
  const faltan = CAMPOS.filter(c => !familiar[c] || !String(familiar[c]).trim());
  if (faltan.length) {
    throw Object.assign(
      new Error(`Datos del familiar responsable incompletos: ${faltan.join(', ')}`),
      { status: 409, camposFaltantes: faltan }
    );
  }
  return familiar;
}

module.exports = { asegurarTitularCompleto, CAMPOS_TITULAR: CAMPOS };
