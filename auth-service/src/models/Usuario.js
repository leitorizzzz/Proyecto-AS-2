/**
 * CAPA DE ENTIDADES / MODELOS
 * Representa un usuario del sistema (personal del asilo).
 * No contiene logica de negocio ni acceso a base de datos.
 */
class Usuario {
  constructor({ id, nombre, email, passwordHash, rol, fechaRegistro, activo }) {
    this.id = id || null;
    this.nombre = nombre;
    this.email = email;
    this.passwordHash = passwordHash;
    this.rol = rol;
    this.fechaRegistro = fechaRegistro || new Date().toISOString();
    // Una cuenta desactivada no puede iniciar sesion, pero su historial
    // (solicitudes, visitas, auditoria) sigue apuntando a su id.
    this.activo = activo === undefined || activo === null ? true : Boolean(activo);
  }

  /** Version segura para devolver por API (sin passwordHash) */
  toPublic() {
    return {
      id: this.id,
      nombre: this.nombre,
      email: this.email,
      rol: this.rol,
      fechaRegistro: this.fechaRegistro,
      activo: this.activo
    };
  }
}

module.exports = Usuario;
