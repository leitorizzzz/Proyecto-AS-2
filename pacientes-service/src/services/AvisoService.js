/**
 * CAPA DE LOGICA DE NEGOCIO — notificaciones internas (caso 12).
 * Cada usuario solo ve y marca sus propios avisos.
 */
class AvisoService {
  constructor(avisoRepository) {
    this.repo = avisoRepository;
  }

  listarMios(idUsuario, { soloNoLeidos = false } = {}) {
    return this.repo.listarPorUsuario(Number(idUsuario), { soloNoLeidos });
  }

  async marcarLeido(id, idUsuario) {
    const aviso = await this.repo.marcarLeido(Number(id), Number(idUsuario));
    // 404 tambien si el aviso es de otra persona: no se revela que existe.
    if (!aviso) throw Object.assign(new Error('Aviso no encontrado'), { status: 404 });
    return aviso;
  }
}

module.exports = AvisoService;
