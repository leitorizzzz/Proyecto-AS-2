const SolicitudReferencia = require('../models/SolicitudReferencia');
const { asegurarPacienteActivo } = require('./reglasPaciente');
const Aviso = require('../models/Aviso');

const ESPECIALIDAD_MAX = 100;
const MOTIVO_MAX = 1000;
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas y transiciones de estado de "solicitudes_referencia".
 *
 * RN-02: un paciente no puede tener dos solicitudes activas para la misma
 * especialidad simultaneamente.
 */
class SolicitudService {
  constructor(solicitudRepository, pacienteRepository, notificacionesClient, usuarioRepository, avisoRepository) {
    this.repo = solicitudRepository;
    this.pacienteRepo = pacienteRepository;
    this.notificacionesClient = notificacionesClient; // opcional
    this.usuarioRepo = usuarioRepository;
    this.avisoRepo = avisoRepository;
  }

  /** Caso 7: el enfermero asignado debe existir, ser enfermero y estar activo. */
  async _asegurarEnfermero(idEnfermero) {
    if (!idEnfermero || !Number.isInteger(Number(idEnfermero))) {
      throw Object.assign(new Error('idEnfermero es requerido: el enfermero(a) que acompana al paciente'), { status: 400 });
    }
    const u = await this.usuarioRepo.obtenerPorId(Number(idEnfermero));
    if (!u || u.rol !== 'enfermero' || u.activo === false) {
      throw Object.assign(new Error(`El usuario ${idEnfermero} no es un enfermero activo`), { status: 400 });
    }
    return u;
  }

  listar() {
    return this.repo.obtenerTodas();
  }

  async obtener(id) {
    const solicitud = await this.repo.obtenerPorId(id);
    if (!solicitud) {
      const err = new Error('Solicitud no encontrada');
      err.status = 404;
      throw err;
    }
    return solicitud;
  }

  listarPorPaciente(idPaciente) {
    return this.repo.obtenerPorPaciente(idPaciente);
  }

  async crear({ idPaciente, especialidad, motivo, idEnfermero }, idMedicoGeneral, authHeader) {
    if (!idPaciente || Number.isNaN(Number(idPaciente))) {
      throw Object.assign(new Error('idPaciente es requerido'), { status: 400 });
    }
    if (!especialidad || especialidad.trim() === '') {
      throw Object.assign(new Error('especialidad es requerida'), { status: 400 });
    }
    if (especialidad.length > ESPECIALIDAD_MAX) {
      throw Object.assign(new Error(`especialidad excede ${ESPECIALIDAD_MAX} caracteres`), { status: 400 });
    }
    if (!motivo || motivo.trim() === '') {
      throw Object.assign(new Error('motivo es requerido'), { status: 400 });
    }
    if (motivo.length > MOTIVO_MAX) {
      throw Object.assign(new Error(`motivo excede ${MOTIVO_MAX} caracteres`), { status: 400 });
    }

    const paciente = await asegurarPacienteActivo(this.pacienteRepo, idPaciente, 'crear solicitudes');
    await this._asegurarEnfermero(idEnfermero);

    // RN-02
    const duplicada = await this.repo.existeSolicitudActiva(Number(idPaciente), especialidad);
    if (duplicada) {
      const ref = duplicada.id ? ` (solicitud #${duplicada.id}, ${SolicitudReferencia.etiquetaEstado(duplicada.estado)})` : '';
      throw Object.assign(
        new Error(`Este paciente ya tiene una solicitud activa en la especialidad "${especialidad}"${ref}. Espere a que se complete o cancélela antes de crear otra.`),
        { status: 409, solicitudActiva: duplicada.id ? { id: duplicada.id, estado: duplicada.estado } : null }
      );
    }

    const solicitud = new SolicitudReferencia({
      idPaciente: Number(idPaciente),
      idMedicoGeneral,
      especialidad: especialidad.trim(),
      motivo: motivo.trim(),
      estado: SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION,
      idEnfermero: Number(idEnfermero)
    });
    const guardada = await this.repo.guardar(solicitud);

    // Fire-and-forget: notificar al familiar. Errores no bloquean la creacion.
    if (this.notificacionesClient) {
      this.notificacionesClient
        .enviarSolicitud({ paciente, especialidad: guardada.especialidad, motivo: guardada.motivo }, authHeader)
        .catch(err => console.warn(`[notificaciones] ${err.message}`));
    }
    return guardada;
  }

  async asignarCita(id, { fechaCita, horaCita, idMedicoEspecialista }) {
    const solicitud = await this.obtener(id);

    if (solicitud.estado !== SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION) {
      throw Object.assign(
        new Error(`Solo se asigna cita a solicitudes pendientes de cita; esta solicitud está ${SolicitudReferencia.etiquetaEstado(solicitud.estado)}.`),
        { status: 409 }
      );
    }
    if (!fechaCita || isNaN(Date.parse(fechaCita))) {
      throw Object.assign(new Error('fechaCita no es una fecha valida (YYYY-MM-DD)'), { status: 400 });
    }
    if (!horaCita || !HORA_REGEX.test(String(horaCita))) {
      throw Object.assign(new Error('horaCita debe tener formato HH:mm o HH:mm:ss'), { status: 400 });
    }
    if (!idMedicoEspecialista || Number.isNaN(Number(idMedicoEspecialista))) {
      throw Object.assign(new Error('idMedicoEspecialista es requerido'), { status: 400 });
    }
    const paciente = await asegurarPacienteActivo(this.pacienteRepo, solicitud.idPaciente, 'asignarle citas');
    const datos = { fechaCita, horaCita: String(horaCita), idMedicoEspecialista: Number(idMedicoEspecialista) };

    // Caso 12: aviso interno al medico general que refirio (medico del
    // asilo) y al enfermero que acompana, en la misma transaccion.
    const especialista = await this.usuarioRepo.obtenerPorId(datos.idMedicoEspecialista);
    const mensaje = `Cita asignada: ${paciente.nombres} ${paciente.apellidos}, ${solicitud.especialidad}, ` +
      `${String(fechaCita).slice(0, 10)} ${String(horaCita).slice(0, 5)}` +
      (especialista ? ` con ${especialista.nombre}` : '') + ` (solicitud #${solicitud.id})`;
    const destinatarios = [...new Set([solicitud.idMedicoGeneral, solicitud.idEnfermero].filter(Boolean))];
    const avisos = destinatarios.map(idUsuario => ({
      idUsuario, tipo: Aviso.TIPOS.CITA_ASIGNADA, mensaje, idSolicitud: solicitud.id
    }));
    return this.repo.asignarCitaConAvisos(id, datos, avisos, this.avisoRepo);
  }

  async marcarEnAtencion(id) {
    const solicitud = await this.obtener(id);
    if (solicitud.estado !== SolicitudReferencia.ESTADOS.CITA_ASIGNADA) {
      throw Object.assign(
        new Error(`Solo se inicia la atención de solicitudes con cita asignada; esta solicitud está ${SolicitudReferencia.etiquetaEstado(solicitud.estado)}.`),
        { status: 409 }
      );
    }
    return this.repo.cambiarEstado(id, SolicitudReferencia.ESTADOS.EN_ATENCION);
  }

  async marcarCompletada(id) {
    const solicitud = await this.obtener(id);
    if (solicitud.estado !== SolicitudReferencia.ESTADOS.EN_ATENCION) {
      throw Object.assign(
        new Error(`Solo se completa una solicitud en atención; esta solicitud está ${SolicitudReferencia.etiquetaEstado(solicitud.estado)}.`),
        { status: 409 }
      );
    }
    return this.repo.cambiarEstado(id, SolicitudReferencia.ESTADOS.COMPLETADA);
  }

  async cancelar(id) {
    const solicitud = await this.obtener(id);
    if (solicitud.estado === SolicitudReferencia.ESTADOS.COMPLETADA) {
      throw Object.assign(
        new Error('No se puede cancelar una solicitud ya completada'),
        { status: 409 }
      );
    }
    if (solicitud.estado === SolicitudReferencia.ESTADOS.CANCELADA) {
      throw Object.assign(new Error('La solicitud ya esta cancelada'), { status: 409 });
    }
    return this.repo.cambiarEstado(id, SolicitudReferencia.ESTADOS.CANCELADA);
  }
}

module.exports = SolicitudService;
