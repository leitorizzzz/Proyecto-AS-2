const SolicitudReferencia = require('../models/SolicitudReferencia');

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
  constructor(solicitudRepository, pacienteRepository, notificacionesClient) {
    this.repo = solicitudRepository;
    this.pacienteRepo = pacienteRepository;
    this.notificacionesClient = notificacionesClient; // opcional
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

  async crear({ idPaciente, especialidad, motivo }, idMedicoGeneral, authHeader) {
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

    const paciente = await this.pacienteRepo.obtenerPorId(Number(idPaciente));
    if (!paciente) {
      throw Object.assign(new Error('Paciente no encontrado'), { status: 404 });
    }

    // RN-02
    const duplicada = await this.repo.existeSolicitudActiva(Number(idPaciente), especialidad);
    if (duplicada) {
      throw Object.assign(
        new Error(`Ya existe una solicitud activa para el paciente ${idPaciente} en la especialidad "${especialidad}"`),
        { status: 409 }
      );
    }

    const solicitud = new SolicitudReferencia({
      idPaciente: Number(idPaciente),
      idMedicoGeneral,
      especialidad: especialidad.trim(),
      motivo: motivo.trim(),
      estado: SolicitudReferencia.ESTADOS.PENDIENTE_ASIGNACION
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
        new Error(`Solo se puede asignar cita a solicitudes en estado 'pendiente_asignacion' (actual: '${solicitud.estado}')`),
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

    return this.repo.asignarCita(id, {
      fechaCita,
      horaCita: String(horaCita),
      idMedicoEspecialista: Number(idMedicoEspecialista)
    });
  }

  async marcarEnAtencion(id) {
    const solicitud = await this.obtener(id);
    if (solicitud.estado !== SolicitudReferencia.ESTADOS.CITA_ASIGNADA) {
      throw Object.assign(
        new Error(`Solo se puede iniciar atencion desde estado 'cita_asignada' (actual: '${solicitud.estado}')`),
        { status: 409 }
      );
    }
    return this.repo.cambiarEstado(id, SolicitudReferencia.ESTADOS.EN_ATENCION);
  }

  async marcarCompletada(id) {
    const solicitud = await this.obtener(id);
    if (solicitud.estado !== SolicitudReferencia.ESTADOS.EN_ATENCION) {
      throw Object.assign(
        new Error(`Solo se puede completar una solicitud en estado 'en_atencion' (actual: '${solicitud.estado}')`),
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
