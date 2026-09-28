class Donante {
  constructor({ id, nombre, telefono, email, direccion, fechaRegistro }) {
    this.id = id || null;
    this.nombre = nombre;
    this.telefono = telefono || null;
    this.email = email || null;
    this.direccion = direccion || null;
    this.fechaRegistro = fechaRegistro || new Date().toISOString();
  }
}
module.exports = Donante;
