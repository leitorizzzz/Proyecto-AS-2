class Donante {
  constructor({ id, nombre, telefono, email, direccion, fechaRegistro, activo }) {
    this.id = id || null;
    this.nombre = nombre;
    this.telefono = telefono || null;
    this.email = email || null;
    this.direccion = direccion || null;
    this.fechaRegistro = fechaRegistro || new Date().toISOString();
    // Un donante desactivado no recibe nuevas donaciones; su historial queda.
    this.activo = activo === undefined || activo === null ? true : Boolean(activo);
  }
}
module.exports = Donante;
