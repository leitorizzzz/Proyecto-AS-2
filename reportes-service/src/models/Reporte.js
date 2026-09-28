/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Un reporte que puede exportarse a PDF o Excel. La estructura es
 * comun a los 7 tipos del enunciado: cabecera, columnas y filas.
 */
class Reporte {
  constructor({ tipo, titulo, generadoEn, filtros, columnas, filas, totales }) {
    this.tipo = tipo;
    this.titulo = titulo;
    this.generadoEn = generadoEn || new Date().toISOString();
    this.filtros = filtros || {};
    this.columnas = columnas;              // [{ key, label, tipo? }]
    this.filas = filas || [];              // [{ [colKey]: value }, ...]
    this.totales = totales || null;        // { colKey: total, ... } opcional
  }
}

Reporte.TIPOS = Object.freeze({
  COSTOS_POR_PACIENTE: 'costos-por-paciente',
  ANALISIS_MEDICO: 'analisis-medico',
  COBROS_POR_RANGO: 'cobros-por-rango',
  PAGOS_FUNDACION: 'pagos-fundacion',
  ENTRADAS: 'entradas',
  EXAMENES: 'examenes',
  MEDICAMENTOS_APLICADOS: 'medicamentos-aplicados'
});

module.exports = Reporte;
