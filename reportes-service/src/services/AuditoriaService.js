const RegistroAuditoria = require('../models/RegistroAuditoria');

const LIMITE_DEFECTO = 200;
const LIMITE_MAXIMO = 1000;
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CAPA DE LOGICA DE NEGOCIO — consulta de la bitacora de auditoria.
 *
 * Fechas: `desde`/`hasta` aceptan YYYY-MM-DD (dia UTC; `hasta` incluye el
 * dia completo) o un instante ISO completo. El frontend manda instantes
 * con los limites del dia local para que "hoy" signifique hoy en
 * Guatemala aunque la tabla guarde UTC.
 */
class AuditoriaService {
  constructor(auditoriaRepository) {
    this.repo = auditoriaRepository;
  }

  _fecha(valor, nombre, { finDeDia = false } = {}) {
    if (valor == null || valor === '') return null;
    const s = String(valor);
    const d = new Date(SOLO_FECHA.test(s) ? `${s}T00:00:00.000Z` : s);
    if (Number.isNaN(d.getTime())) {
      throw Object.assign(new Error(`${nombre} no es una fecha válida (YYYY-MM-DD o ISO)`), { status: 400 });
    }
    if (finDeDia && SOLO_FECHA.test(s)) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  async listar({ desde, hasta, entidad, idEntidad, limite } = {}) {
    const d = this._fecha(desde, 'desde');
    const h = this._fecha(hasta, 'hasta', { finDeDia: true });
    if (d && h && d >= h) {
      throw Object.assign(new Error('desde debe ser anterior a hasta'), { status: 400 });
    }
    if (entidad && !RegistroAuditoria.ENTIDADES.includes(entidad)) {
      throw Object.assign(
        new Error(`entidad debe ser una de: ${RegistroAuditoria.ENTIDADES.join(', ')}`),
        { status: 400 }
      );
    }
    let id = null;
    if (idEntidad != null && idEntidad !== '') {
      id = Number(idEntidad);
      if (!Number.isInteger(id) || id <= 0) {
        throw Object.assign(new Error('idEntidad debe ser un entero positivo'), { status: 400 });
      }
    }
    let lim = limite == null || limite === '' ? LIMITE_DEFECTO : Number(limite);
    if (!Number.isInteger(lim) || lim <= 0) {
      throw Object.assign(new Error('limite debe ser un entero positivo'), { status: 400 });
    }
    lim = Math.min(lim, LIMITE_MAXIMO);

    try {
      return await this.repo.listar({ desde: d, hasta: h, entidad: entidad || null, idEntidad: id, limite: lim });
    } catch (err) {
      // 208 = la tabla aun no existe (ningun servicio escritor arranco todavia).
      if (err.number === 208) return [];
      throw err;
    }
  }
}

AuditoriaService.LIMITE_DEFECTO = LIMITE_DEFECTO;
AuditoriaService.LIMITE_MAXIMO = LIMITE_MAXIMO;

module.exports = AuditoriaService;
