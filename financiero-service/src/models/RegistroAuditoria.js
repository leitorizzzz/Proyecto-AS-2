/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Un registro de la tabla compartida `auditoria`: quien hizo que accion
 * sobre que entidad y cuando. Este archivo se copia identico en los
 * servicios que registran (auth, pacientes, farmacia, financiero) y en
 * reportes-service, que es quien la lee (GET /api/auditoria).
 */
class RegistroAuditoria {
  constructor({ id, usuario, idUsuario, accion, entidad, idEntidad, detalle, fecha,
                ip, modulo, datosAnteriores, datosNuevos }) {
    this.id = id || null;
    this.usuario = usuario;                  // email del JWT
    this.idUsuario = idUsuario != null ? Number(idUsuario) : null;
    this.accion = accion;
    this.entidad = entidad;
    this.idEntidad = idEntidad != null ? Number(idEntidad) : null;
    this.detalle = detalle || null;
    this.fecha = fecha || null;
    this.ip = ip || null;
    this.modulo = modulo || null;
    // En la BD son texto JSON; aqui siempre objetos (o null).
    this.datosAnteriores = RegistroAuditoria.leerJson(datosAnteriores);
    this.datosNuevos = RegistroAuditoria.leerJson(datosNuevos);
  }

  datosAnterioresJson() { return RegistroAuditoria.aJson(this.datosAnteriores); }
  datosNuevosJson() { return RegistroAuditoria.aJson(this.datosNuevos); }

  static leerJson(v) {
    if (v == null || v === '') return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return { valor: v }; }
  }

  /** Nunca guarda contrasenas ni hashes; acota el tamano. */
  static aJson(obj) {
    if (obj == null) return null;
    const limpio = JSON.parse(JSON.stringify(obj, (k, v) =>
      (/password|passwordhash|token/i.test(k) ? undefined : v)));
    const texto = JSON.stringify(limpio);
    return texto.length > 20000 ? JSON.stringify({ truncado: true, inicio: texto.slice(0, 19000) }) : texto;
  }
}

RegistroAuditoria.ACCIONES = Object.freeze([
  'crear', 'modificar', 'cancelar', 'desactivar', 'reactivar'
]);

RegistroAuditoria.ENTIDADES = Object.freeze([
  'usuario', 'paciente', 'solicitud', 'visita', 'examen', 'prescripcion',
  'medicamento', 'dispensacion', 'cargo', 'cuota', 'donante', 'donacion',
  'gasto', 'pago_fundacion', 'familiar', 'abono'
]);

module.exports = RegistroAuditoria;
