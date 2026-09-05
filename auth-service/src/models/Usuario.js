/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa un usuario del sistema (personal del asilo).
 * No contiene logica de negocio ni acceso a base de datos.
 */
class Usuario {
  constructor({ id, nombre, email, passwordHash, rol, fechaRegistro }) {
    this.id = id || null;
    this.nombre = nombre;
    this.email = email;
    this.passwordHash = passwordHash;
    this.rol = rol;
    this.fechaRegistro = fechaRegistro || new Date().toISOString();
  }

  /** Version segura para devolver por API (sin passwordHash) */
  toPublic() {
    return {
      id: this.id,
      nombre: this.nombre,
      email: this.email,
      rol: this.rol,
      fechaRegistro: this.fechaRegistro
    };
  }
}

module.exports = Usuario;
