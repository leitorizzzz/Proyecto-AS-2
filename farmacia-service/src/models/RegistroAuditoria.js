/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Un registro de la tabla compartida `auditoria`: quien hizo que accion
 * sobre que entidad y cuando. Este archivo se copia identico en los
 * servicios que registran (auth, pacientes, farmacia, financiero) y en
 * reportes-service, que es quien la lee (GET /api/auditoria).
 */
class RegistroAuditoria {
  constructor({ id, usuario, idUsuario, accion, entidad, idEntidad, detalle, fecha }) {
    this.id = id || null;
    this.usuario = usuario;                  // email del JWT
    this.idUsuario = idUsuario != null ? Number(idUsuario) : null;
    this.accion = accion;
    this.entidad = entidad;
    this.idEntidad = idEntidad != null ? Number(idEntidad) : null;
    this.detalle = detalle || null;
    this.fecha = fecha || null;
  }
}

RegistroAuditoria.ACCIONES = Object.freeze([
  'crear', 'modificar', 'cancelar', 'desactivar', 'reactivar'
]);

RegistroAuditoria.ENTIDADES = Object.freeze([
  'usuario', 'paciente', 'solicitud', 'visita', 'examen', 'prescripcion',
  'medicamento', 'dispensacion', 'cargo', 'cuota', 'donante', 'donacion',
  'gasto', 'pago_fundacion'
]);

module.exports = RegistroAuditoria;
