/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Resultado de un examen de laboratorio pedido durante una visita
 * medica. El id del examen viene de visita_examenes (registrado por
 * pacientes-service). Este servicio es el unico dueno de resultados.
 */
class ResultadoExamen {
  constructor({
    id,
    idExamen,
    tipoResultado,
    valorTexto,
    valorNumerico,
    archivoAdjunto,
    estado,
    fechaSolicitud,
    fechaDisponible
  }) {
    this.id = id || null;
    this.idExamen = idExamen;
    this.tipoResultado = tipoResultado;
    this.valorTexto = valorTexto || null;
    this.valorNumerico = valorNumerico == null ? null : Number(valorNumerico);
    this.archivoAdjunto = archivoAdjunto || null;
    this.estado = estado || 'registrado';
    this.fechaSolicitud = fechaSolicitud || null;
    this.fechaDisponible = fechaDisponible || null;
  }

  marcarDisponible() {
    this.estado = 'disponible';
    this.fechaDisponible = new Date().toISOString();
  }
}

ResultadoExamen.ESTADOS = Object.freeze({
  REGISTRADO: 'registrado',
  DISPONIBLE: 'disponible'
});

ResultadoExamen.TIPOS = Object.freeze({
  TEXTO: 'texto',
  NUMERICO: 'numerico',
  ARCHIVO: 'archivo',
  MIXTO: 'mixto'
});

module.exports = ResultadoExamen;
