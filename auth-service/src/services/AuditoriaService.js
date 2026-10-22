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
   * Contexto de la peticion para la auditoria: usuario del JWT, IP del
   * cliente y modulo del sistema. Funcion pura sobre el objeto request.
   */
  static contextoDe(req, modulo) {
    const reenviada = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (reenviada || req?.ip || req?.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null;
    return { usuario: req?.usuario || null, ip, modulo };
  }

  /**
   * @param contexto { usuario: payload del JWT, ip, modulo } (ver contextoDe)
   * @param accion   una de RegistroAuditoria.ACCIONES
   * @param entidad  una de RegistroAuditoria.ENTIDADES
   * @param datos    { antes, despues }: estado del registro antes y despues
   *                 de la accion (se guardan como JSON)
   */
  async registrar(contexto, accion, entidad, idEntidad = null, detalle = null, { antes = null, despues = null } = {}) {
    try {
      if (!RegistroAuditoria.ACCIONES.includes(accion)) throw new Error(`accion desconocida '${accion}'`);
      if (!RegistroAuditoria.ENTIDADES.includes(entidad)) throw new Error(`entidad desconocida '${entidad}'`);
      const usuario = contexto?.usuario;
      return await this.repo.guardar(new RegistroAuditoria({
        usuario: usuario?.email || 'desconocido',
        idUsuario: usuario?.sub ?? null,
        accion,
        entidad,
        idEntidad,
        detalle: detalle == null ? null : String(detalle).slice(0, 300),
        ip: contexto?.ip || null,
        modulo: contexto?.modulo || null,
        datosAnteriores: antes,
        datosNuevos: despues
      }));
    } catch (err) {
      console.warn(`[auditoria] no se registro ${accion} ${entidad} #${idEntidad}: ${err.message}`);
      return null;
    }
  }
}

module.exports = AuditoriaService;
