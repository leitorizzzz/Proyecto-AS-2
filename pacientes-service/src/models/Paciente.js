/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa un paciente (interno) del asilo.
 * No contiene logica de negocio ni acceso a base de datos.
 */
class Paciente {
  constructor({
    id,
    nombres,
    apellidos,
    fechaNacimiento,
    genero,
    dpi,
    direccion,
    telefono,
    contactoEmergencia,
    padecimientos,
    fechaIngreso
  }) {
    this.id = id || null;
    this.nombres = nombres;
    this.apellidos = apellidos;
    this.fechaNacimiento = fechaNacimiento;
    this.genero = genero;
    this.dpi = dpi;
    this.direccion = direccion || null;
    this.telefono = telefono || null;
    this.contactoEmergencia = contactoEmergencia || null;
    this.padecimientos = padecimientos || null;
    this.fechaIngreso = fechaIngreso || new Date().toISOString();
  }

  nombreCompleto() {
    return `${this.nombres} ${this.apellidos}`.trim();
  }
}

module.exports = Paciente;
