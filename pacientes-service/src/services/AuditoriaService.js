const RegistroAuditoria = require('../models/RegistroAuditoria');

/**
 * CAPA DE LOGICA DE NEGOCIO
 *
 * Registra en `auditoria` las acciones de crear / modificar / cancelar /
 * desactivar / reactivar. Nunca hace fallar la operacion auditada: si el
 * registro no se puede guardar, lo deja en el log del contenedor y sigue.
 * Copia identica en auth, pacientes, farmacia y financiero.
 */
class AuditoriaService {
  constructor(auditoriaRepository) {
    this.repo = auditoriaRepository;
  }

  /**
   * @param usuario  payload del JWT ({ sub, email, rol })
   * @param accion   una de RegistroAuditoria.ACCIONES
   * @param entidad  una de RegistroAuditoria.ENTIDADES
   */
  async registrar(usuario, accion, entidad, idEntidad = null, detalle = null) {
    try {
      if (!RegistroAuditoria.ACCIONES.includes(accion)) throw new Error(`accion desconocida '${accion}'`);
      if (!RegistroAuditoria.ENTIDADES.includes(entidad)) throw new Error(`entidad desconocida '${entidad}'`);
      return await this.repo.guardar(new RegistroAuditoria({
        usuario: usuario?.email || 'desconocido',
        idUsuario: usuario?.sub ?? null,
        accion,
        entidad,
        idEntidad,
        detalle: detalle == null ? null : String(detalle).slice(0, 300)
      }));
    } catch (err) {
      console.warn(`[auditoria] no se registro ${accion} ${entidad} #${idEntidad}: ${err.message}`);
      return null;
    }
  }
}

module.exports = AuditoriaService;
