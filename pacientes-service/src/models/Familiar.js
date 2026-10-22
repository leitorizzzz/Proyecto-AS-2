/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Familiar responsable de un paciente (caso 5). El principal es el titular
 * de la cuenta: a el se cargan las visitas y los servicios. Para mover la
 * cuenta sus datos deben estar completos (caso 20).
 */
class Familiar {
  constructor({ id, idPaciente, nombres, apellidos, dpi, parentesco, telefono, email,
                direccion, principal, activo, fechaRegistro }) {
    this.id = id || null;
    this.idPaciente = idPaciente ?? null;
    this.nombres = nombres != null ? String(nombres).trim() : null;
    this.apellidos = apellidos != null ? String(apellidos).trim() : null;
    this.dpi = dpi != null ? String(dpi).trim() : null;
    this.parentesco = parentesco != null ? String(parentesco).trim() : null;
    this.telefono = telefono != null ? String(telefono).trim() : null;
    this.email = email != null ? String(email).trim() : null;
    this.direccion = direccion != null ? String(direccion).trim() : null;
    this.principal = principal === undefined || principal === null ? true : Boolean(principal);
    this.activo = activo === undefined || activo === null ? true : Boolean(activo);
    this.fechaRegistro = fechaRegistro || null;
  }

  nombreCompleto() { return `${this.nombres || ''} ${this.apellidos || ''}`.trim(); }
}

/** Campos que deben venir completos para registrar o cobrar a un familiar. */
Familiar.CAMPOS_OBLIGATORIOS = Object.freeze(['nombres', 'apellidos', 'dpi', 'parentesco', 'telefono', 'email', 'direccion']);

module.exports = Familiar;
