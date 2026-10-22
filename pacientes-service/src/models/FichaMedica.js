/**
 * CAPA DE ENTIDADES / MODELOS
 *
 * Ficha medica del paciente, 1:1 (UNIQUE idPaciente). Se abre sola al dar
 * de alta al paciente (caso 5) y las visitas medicas se vinculan a ella
 * (caso 13).
 */
class FichaMedica {
  constructor({ id, idPaciente, grupoSanguineo, alergias, antecedentes, fechaApertura }) {
    this.id = id || null;
    this.idPaciente = idPaciente;
    this.grupoSanguineo = grupoSanguineo || null;
    this.alergias = alergias || null;
    this.antecedentes = antecedentes || null;
    this.fechaApertura = fechaApertura || null;
  }
}
module.exports = FichaMedica;
