const VisitaMedica = require('../models/VisitaMedica');
const SolicitudReferencia = require('../models/SolicitudReferencia');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas y transiciones de "visitas_medicas".
 * Trabaja de la mano con SolicitudService: al crear una visita mueve la
 * solicitud a 'en_atencion'; al completar la visita la mueve a 'completada'.
 */
class VisitaMedicaService {
  constructor(visitaRepository, solicitudService) {
    this.repo = visitaRepository;
    this.solicitudService = solicitudService;
  }

  obtener(id) { return this._obtener(id); }
  obtenerPorSolicitud(idSolicitud) { return this.repo.obtenerPorSolicitud(idSolicitud); }
  obtenerPorPaciente(idPaciente) { return this.repo.obtenerPorPaciente(idPaciente); }

  async _obtener(id) {
    const visita = await this.repo.obtenerPorId(id);
    if (!visita) {
      throw Object.assign(new Error('Visita medica no encontrada'), { status: 404 });
    }
    return visita;
  }

  /**
   * Convierte una solicitud con cita_asignada en una visita activa.
   * Enlaza la visita a la solicitud y mueve la solicitud a 'en_atencion'.
   */
  async convertirDesdeSolicitud(idSolicitud, idMedicoEspecialista) {
    const solicitud = await this.solicitudService.obtener(idSolicitud);

    if (solicitud.estado !== SolicitudReferencia.ESTADOS.CITA_ASIGNADA) {
      throw Object.assign(
        new Error(`Solo se puede iniciar visita desde solicitudes en 'cita_asignada' (actual: '${solicitud.estado}')`),
        { status: 409 }
      );
    }

    const yaExiste = await this.repo.obtenerPorSolicitud(idSolicitud);
    if (yaExiste) {
      throw Object.assign(
        new Error(`Ya existe una visita medica para la solicitud ${idSolicitud}`),
        { status: 409 }
      );
    }

    const visita = new VisitaMedica({
      idSolicitudReferencia: solicitud.id,
      idPaciente: solicitud.idPaciente,
      idMedicoEspecialista,
      estado: VisitaMedica.ESTADOS.EN_ATENCION
    });
    const creada = await this.repo.guardar(visita);
    await this.solicitudService.marcarEnAtencion(solicitud.id);
    return creada;
  }

  async actualizarClinico(id, { diagnostico, observaciones }) {
    const visita = await this._obtener(id);
    if (visita.estado !== VisitaMedica.ESTADOS.EN_ATENCION) {
      throw Object.assign(
        new Error(`Solo se puede editar una visita en estado 'en_atencion' (actual: '${visita.estado}')`),
        { status: 409 }
      );
    }
    return this.repo.actualizarClinico(id, {
      diagnostico: diagnostico == null ? visita.diagnostico : String(diagnostico),
      observaciones: observaciones == null ? visita.observaciones : String(observaciones)
    });
  }

  async agregarExamen(id, datos) {
    const visita = await this._obtener(id);
    if (visita.estado !== VisitaMedica.ESTADOS.EN_ATENCION) {
      throw Object.assign(new Error('Solo se pueden agregar examenes a una visita en atencion'), { status: 409 });
    }
    if (!datos || !datos.tipo || String(datos.tipo).trim() === '') {
      throw Object.assign(new Error('tipo del examen es requerido'), { status: 400 });
    }
    return this.repo.agregarExamen(id, { tipo: String(datos.tipo).trim() });
  }

  async agregarPrescripcion(id, datos) {
    const visita = await this._obtener(id);
    if (visita.estado !== VisitaMedica.ESTADOS.EN_ATENCION) {
      throw Object.assign(new Error('Solo se pueden agregar prescripciones a una visita en atencion'), { status: 409 });
    }
    if (!datos || !datos.medicamento || String(datos.medicamento).trim() === '') {
      throw Object.assign(new Error('medicamento es requerido'), { status: 400 });
    }
    return this.repo.agregarPrescripcion(id, {
      medicamento: String(datos.medicamento).trim(),
      dosis: datos.dosis ? String(datos.dosis) : null,
      indicaciones: datos.indicaciones ? String(datos.indicaciones) : null,
      // idMedicamento es opcional al prescribir, pero obligatorio para que
      // farmacia-service pueda dispensarla despues (RN-06). Si viene vacio,
      // la prescripcion queda como registro informativo y no se podra
      // dispensar hasta que el especialista la asocie a un medicamento.
      idMedicamento: datos.idMedicamento != null ? Number(datos.idMedicamento) : null
    });
  }

  /**
   * Marcar visita como completa. Exige diagnostico y observaciones no vacios.
   * Al completar: la solicitud enlazada pasa a 'completada'.
   */
  async completar(id) {
    const visita = await this._obtener(id);
    if (visita.estado !== VisitaMedica.ESTADOS.EN_ATENCION) {
      throw Object.assign(
        new Error(`Solo se puede completar una visita en 'en_atencion' (actual: '${visita.estado}')`),
        { status: 409 }
      );
    }
    if (!visita.diagnostico || String(visita.diagnostico).trim() === '') {
      throw Object.assign(
        new Error('No se puede completar la visita: falta diagnostico'),
        { status: 400 }
      );
    }
    if (!visita.observaciones || String(visita.observaciones).trim() === '') {
      throw Object.assign(
        new Error('No se puede completar la visita: faltan observaciones'),
        { status: 400 }
      );
    }

    const completada = await this.repo.marcarCompletada(id);
    await this.solicitudService.marcarCompletada(visita.idSolicitudReferencia);
    return completada;
  }
}

module.exports = VisitaMedicaService;
