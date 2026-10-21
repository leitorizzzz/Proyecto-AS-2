/**
 * CAPA DE LOGICA DE NEGOCIO — regla "paciente activo".
 *
 * Un paciente desactivado (borrado logico) conserva su historial, pero no
 * puede recibir solicitudes, citas, visitas, examenes ni prescripciones.
 * La usan SolicitudService y VisitaMedicaService; farmacia-service aplica
 * la misma regla al dispensar leyendo la tabla compartida.
 */
async function asegurarPacienteActivo(pacienteRepo, idPaciente, accion) {
  const paciente = await pacienteRepo.obtenerPorId(Number(idPaciente));
  if (!paciente) {
    throw Object.assign(new Error('Paciente no encontrado'), { status: 404 });
  }
  if (paciente.activo === false) {
    const nombre = `${paciente.nombres} ${paciente.apellidos}`.trim();
    throw Object.assign(
      new Error(`El paciente ${nombre} esta desactivado: no se puede ${accion}. Un administrador puede reactivarlo.`),
      { status: 409 }
    );
  }
  return paciente;
}

module.exports = { asegurarPacienteActivo };
