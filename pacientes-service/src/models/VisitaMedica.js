/**
 * CAPA DE ENTIDADES / MODELOS
 * Visita medica generada a partir de una solicitud de referencia
 * cuando el medico especialista recibe al paciente.
 *
 * Contiene diagnostico, observaciones, examenes (los procesa
 * laboratorio-service), prescripciones (las despacha farmacia-service) y el
 * costo preferencial acumulado (RN-09) de laboratorio y farmacia.
 */
class VisitaMedica {
  constructor({
    id,
    idSolicitudReferencia,
    idPaciente,
    idMedicoEspecialista,
    fecha,
    diagnostico,
    observaciones,
    estado,
    fechaCompletada,
    costoLaboratorio,
    costoFarmacia,
    idFichaMedica
  }) {
    this.id = id || null;
    this.idSolicitudReferencia = idSolicitudReferencia;
    this.idPaciente = idPaciente;
    this.idMedicoEspecialista = idMedicoEspecialista;
    this.fecha = fecha || new Date().toISOString();
    this.diagnostico = diagnostico || null;
    this.observaciones = observaciones || null;
    this.estado = estado || 'en_atencion';
    this.fechaCompletada = fechaCompletada || null;
    this.costoLaboratorio = Number(costoLaboratorio || 0);
    this.costoFarmacia = Number(costoFarmacia || 0);
    this.idFichaMedica = idFichaMedica ?? null;   // caso 13
    this.examenes = [];         // se llena desde el service al leer
    this.prescripciones = [];   // se llena desde el service al leer
  }
}

/** Abierta = se puede editar y cerrar. */
VisitaMedica.prototype.estaAbierta = function () {
  return this.estado === VisitaMedica.ESTADOS.EN_ATENCION || this.estado === VisitaMedica.ESTADOS.INCOMPLETA;
};

/** Caso 14: sin estos campos la visita no se cierra y queda 'incompleta'. */
VisitaMedica.CAMPOS_OBLIGATORIOS_CIERRE = Object.freeze(['diagnostico', 'observaciones']);

VisitaMedica.ESTADOS = Object.freeze({
  EN_ATENCION: 'en_atencion',
  INCOMPLETA: 'incompleta',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada'
});

// Texto del estado para los mensajes que ve el usuario.
VisitaMedica.ETIQUETAS_ESTADO = Object.freeze({
  en_atencion: 'en atención',
  incompleta: 'incompleta',
  completada: 'completada',
  cancelada: 'cancelada'
});
VisitaMedica.etiquetaEstado = estado =>
  VisitaMedica.ETIQUETAS_ESTADO[estado] || String(estado || '').replace(/_/g, ' ');

module.exports = VisitaMedica;
