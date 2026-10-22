const VisitaMedica = require('../models/VisitaMedica');
const SolicitudReferencia = require('../models/SolicitudReferencia');
const CargoVisita = require('../models/CargoVisita');
const { asegurarPacienteActivo } = require('./reglasPaciente');
const { asegurarFamiliarCompleto } = require('./reglasFamiliar');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas y transiciones de "visitas_medicas".
 * Trabaja de la mano con SolicitudService: al crear una visita mueve la
 * solicitud a 'en_atencion'; al completar la visita la mueve a 'completada'.
 */
class VisitaMedicaService {
  constructor(visitaRepository, solicitudService, pacienteRepository) {
    this.repo = visitaRepository;
    this.solicitudService = solicitudService;
    this.pacienteRepo = pacienteRepository;
    // RN-09: descuento de la fundacion sobre el cargo de la visita.
    this.descuento = Number(process.env.DESCUENTO_FUNDACION || 0.20);
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

    await asegurarPacienteActivo(this.pacienteRepo, solicitud.idPaciente, 'iniciarle visitas');

    const yaExiste = await this.repo.obtenerPorSolicitud(idSolicitud);
    if (yaExiste) {
      throw Object.assign(
        new Error(`Ya existe una visita medica para la solicitud ${idSolicitud}`),
        { status: 409 }
      );
    }

    // Caso 13: la visita queda vinculada a la ficha medica (1:1 con el paciente).
    const ficha = await this.pacienteRepo.asegurarFicha(solicitud.idPaciente);
    const visita = new VisitaMedica({
      idSolicitudReferencia: solicitud.id,
      idPaciente: solicitud.idPaciente,
      idFichaMedica: ficha ? ficha.id : null,
      idMedicoEspecialista,
      estado: VisitaMedica.ESTADOS.EN_ATENCION
    });
    const creada = await this.repo.guardar(visita);
    await this.solicitudService.marcarEnAtencion(solicitud.id);
    return creada;
  }

  async actualizarClinico(id, { diagnostico, observaciones }) {
    const visita = await this._obtener(id);
    if (!visita.estaAbierta()) {
      throw Object.assign(
        new Error(`Solo se puede editar una visita en estado 'en_atencion' o 'incompleta' (actual: '${visita.estado}')`),
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
    if (!visita.estaAbierta()) {
      throw Object.assign(new Error('Solo se pueden agregar examenes a una visita en atencion o incompleta'), { status: 409 });
    }
    if (!datos || !datos.tipo || String(datos.tipo).trim() === '') {
      throw Object.assign(new Error('tipo del examen es requerido'), { status: 400 });
    }
    await asegurarPacienteActivo(this.pacienteRepo, visita.idPaciente, 'pedirle examenes');
    return this.repo.agregarExamen(id, { tipo: String(datos.tipo).trim() });
  }

  async agregarPrescripcion(id, datos) {
    const visita = await this._obtener(id);
    if (!visita.estaAbierta()) {
      throw Object.assign(new Error('Solo se pueden agregar prescripciones a una visita en atencion o incompleta'), { status: 409 });
    }
    if (!datos || !datos.medicamento || String(datos.medicamento).trim() === '') {
      throw Object.assign(new Error('medicamento es requerido'), { status: 400 });
    }
    await asegurarPacienteActivo(this.pacienteRepo, visita.idPaciente, 'prescribirle medicamentos');
    // Despacho parcial (caso 18): farmacia lleva la cuenta de lo entregado
    // contra esta cantidad, asi que es obligatoria y entera.
    const cantidadPrescrita = Number(datos.cantidadPrescrita);
    if (!Number.isInteger(cantidadPrescrita) || cantidadPrescrita < 1 || cantidadPrescrita > 10000) {
      throw Object.assign(new Error('cantidadPrescrita es requerida: entero entre 1 y 10000'), { status: 400 });
    }
    return this.repo.agregarPrescripcion(id, {
      cantidadPrescrita,
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
   * Caso 14: si faltan, la visita queda 'incompleta' (sigue editable) y el
   * error trae camposFaltantes para que la UI los resalte.
   * Al completar: la solicitud enlazada pasa a 'completada'.
   */
  async completar(id) {
    const visita = await this._obtener(id);
    if (!visita.estaAbierta()) {
      throw Object.assign(
        new Error(`Solo se puede completar una visita en 'en_atencion' o 'incompleta' (actual: '${visita.estado}')`),
        { status: 409 }
      );
    }
    const camposFaltantes = VisitaMedica.CAMPOS_OBLIGATORIOS_CIERRE
      .filter(c => !visita[c] || String(visita[c]).trim() === '');
    if (camposFaltantes.length) {
      await this.repo.marcarIncompleta(id);
      const texto = camposFaltantes.map(c => (c === 'diagnostico' ? 'falta diagnostico' : 'faltan observaciones'));
      throw Object.assign(
        new Error(`No se puede completar la visita: ${texto.join(' y ')}. La visita queda incompleta.`),
        { status: 400, camposFaltantes, estadoVisita: VisitaMedica.ESTADOS.INCOMPLETA }
      );
    }

    // Cierre + cargo al familiar en una sola transaccion (caso 19).
    const { visita: completada, cargo } = await this.repo.completarConCargo(
      id, datos => this.construirCargoVisita(datos));
    return { ...completada, cargo };
  }

  /**
   * Regla de negocio del cargo de la visita (caso 19 + RN-09). Recibe lo que
   * el repositorio leyo dentro de la transaccion y devuelve el CargoVisita.
   *   - consulta: tarifa 'consulta_especialista' menos el descuento;
   *   - laboratorio: cada examen pedido, a su precio de catalogo (o el
   *     registrado al ordenarlo) menos el descuento;
   *   - farmacia: cada dispensacion de la visita, cuyo costoTotal ya trae
   *     el descuento aplicado por farmacia-service.
   * Falla cerrado: sin tarifa o con un examen sin precio no se cierra la
   * visita (no se cobra en cero en silencio).
   */
  construirCargoVisita({ visita, tarifa, examenes = [], dispensaciones = [], familiar = null, exigirFamiliar = true }) {
    // Caso 20: el cargo va a la cuenta del familiar responsable, que debe
    // tener datos completos. Sin el, la visita no se cierra.
    if (exigirFamiliar) {
      if (!familiar) {
        throw Object.assign(
          new Error('El paciente no tiene familiar responsable registrado: registrelo antes de cerrar la visita'),
          { status: 409 }
        );
      }
      asegurarFamiliarCompleto(familiar, 'no se puede generar el cargo de la visita');
    }
    if (!tarifa || !(Number(tarifa.precioBase) > 0)) {
      throw Object.assign(
        new Error("No hay tarifa de consulta configurada ('consulta_especialista'); no se puede generar el cargo de la visita"),
        { status: 409 }
      );
    }
    const r = n => Math.round(Number(n) * 100) / 100;
    const conDescuento = (rubro, descripcion, base, idReferencia) => {
      const descuento = r(Number(base) * this.descuento);
      return { rubro, descripcion, idReferencia, montoBase: r(base), descuento, monto: r(Number(base) - descuento) };
    };

    const detalles = [conDescuento('consulta', tarifa.descripcion || 'Consulta con especialista', tarifa.precioBase, visita.id)];
    for (const ex of examenes) {
      const base = ex.precioBase ?? ex.precioCatalogo;
      if (base == null) {
        throw Object.assign(
          new Error(`El examen "${ex.tipo}" (#${ex.id}) no tiene precio configurado; no se puede generar el cargo de la visita`),
          { status: 409 }
        );
      }
      detalles.push(ex.costo != null && ex.precioBase != null
        ? { rubro: 'laboratorio', descripcion: ex.tipo, idReferencia: ex.id,
            montoBase: r(ex.precioBase), descuento: r(ex.descuento), monto: r(ex.costo) }
        : conDescuento('laboratorio', ex.tipo, base, ex.id));
    }
    for (const d of dispensaciones) {
      const costo = r(d.costoTotal);
      const base = d.montoBase != null ? r(d.montoBase) : r(costo / (1 - this.descuento));
      detalles.push({ rubro: 'farmacia', descripcion: `${d.cantidad} x ${d.medicamento}`, idReferencia: d.id,
                      montoBase: base, descuento: r(base - costo), monto: costo });
    }

    const monto = r(detalles.reduce((acc, d) => acc + d.monto, 0));
    const nEx = examenes.length, nRx = dispensaciones.length;
    return new CargoVisita({
      idPaciente: visita.idPaciente,
      idVisita: visita.id,
      idFamiliar: familiar ? familiar.id : null,
      concepto: `Visita medica #${visita.id}: consulta + ${nEx} examen(es) + ${nRx} dispensacion(es), con descuento fundacion`,
      monto,
      detalles
    });
  }
}

module.exports = VisitaMedicaService;
