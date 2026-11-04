const { getPool } = require('./database');

/**
 * CAPA DE ACCESO A DATOS — vistas de SOLO LECTURA con los nombres del
 * documento de Analisis (los que usa el plan del SQA para inspeccionar la
 * base). Las tablas reales NO se renombran: cada vista traduce nombres de
 * tabla, de columna y de estado. Idempotentes (CREATE OR ALTER VIEW).
 *
 * Las crea reportes-service al arrancar (reintenta hasta que los demas
 * servicios hayan creado sus tablas) y scripts/bootstrap.* con
 * `npm run vistas` dentro del contenedor. Equivalencias en
 * docs/EQUIVALENCIAS.md.
 */
const VISTAS = {
  internos: `
    SELECT p.id AS id_interno, p.nombres, p.apellidos, p.dpi,
           p.fechaNacimiento AS fecha_nacimiento, p.genero, p.direccion, p.telefono,
           p.padecimientos, p.fechaIngreso AS fecha_ingreso,
           CASE WHEN p.activo = 1 THEN 'activo' ELSE 'inactivo' END AS estado,
           p.fechaEgreso AS fecha_egreso, p.motivoEgreso AS motivo_egreso
    FROM pacientes p`,

  familiares_responsables: `
    SELECT f.id AS id_familiar, f.idPaciente AS id_interno, f.nombres, f.apellidos, f.dpi,
           f.parentesco, f.telefono, f.email AS correo, f.direccion,
           CAST(f.principal AS BIT) AS es_principal,
           CASE WHEN f.activo = 1 THEN 'activo' ELSE 'inactivo' END AS estado,
           f.fechaRegistro AS fecha_registro
    FROM familiares f`,

  examenes_laboratorio: `
    SELECT ex.id AS id_examen, ex.idVisita AS id_visita, vm.idPaciente AS id_interno,
           ex.tipo AS tipo_examen, ex.estado,                      -- pendiente / disponible
           ex.precioBase AS precio_base, ex.descuento AS descuento_preferencial,
           ex.costo AS costo_con_descuento, ex.fechaSolicitud AS fecha_solicitud
    FROM visita_examenes ex
    INNER JOIN visitas_medicas vm ON vm.id = ex.idVisita`,

  despachos_farmacia: `
    SELECT d.id AS id_despacho, d.idPrescripcion AS id_prescripcion, d.idVisita AS id_visita,
           d.idPaciente AS id_interno, d.idMedicamento AS id_medicamento, m.nombre AS medicamento,
           d.cantidad AS cantidad_despachada, d.montoBase AS monto_base,
           d.montoBase - d.costoTotal AS descuento_preferencial, d.costoTotal AS costo_con_descuento,
           p.estado AS estado_prescripcion, d.fecha AS fecha_despacho
    FROM dispensaciones d
    LEFT JOIN medicamentos m ON m.id = d.idMedicamento
    LEFT JOIN visita_prescripciones p ON p.id = d.idPrescripcion`,

  // Una fila por concepto cobrado (desglose del cargo); los cargos manuales
  // sin desglose salen como tipo_cargo 'otros'.
  cargos_servicios_medicos: `
    SELECT cs.id AS id_cargo, d.id AS id_detalle, cs.idPaciente AS id_interno, cs.idFamiliar AS id_familiar,
           cs.idVisita AS id_visita, cs.origen, d.rubro AS tipo_cargo, d.descripcion,
           d.montoBase AS monto_base, d.descuento AS descuento_preferencial, d.monto,
           CASE cs.estado WHEN 'pagado' THEN 'pagado' WHEN 'parcial' THEN 'abonado' ELSE 'pendiente' END AS estado_cobro,
           cs.fecha
    FROM cargos_servicio cs
    INNER JOIN cargos_detalle d ON d.idCargo = cs.id
    UNION ALL
    SELECT cs.id, NULL, cs.idPaciente, cs.idFamiliar, cs.idVisita, cs.origen, 'otros', cs.concepto,
           cs.monto, 0, cs.monto,
           CASE cs.estado WHEN 'pagado' THEN 'pagado' WHEN 'parcial' THEN 'abonado' ELSE 'pendiente' END,
           cs.fecha
    FROM cargos_servicio cs
    WHERE NOT EXISTS (SELECT 1 FROM cargos_detalle d WHERE d.idCargo = cs.id)`,

  // Sin el cuerpo del correo: el de recuperacion de contrasena lleva el enlace.
  log_notificaciones: `
    SELECT n.id AS id_notificacion, n.idPaciente AS id_interno, n.tipoEvento AS tipo_evento,
           n.destinatarioEmail AS destinatario, n.asunto,
           CASE n.estado WHEN 'enviada' THEN 'enviado' WHEN 'pendiente' THEN 'pendiente' ELSE 'error' END AS estado_envio,
           n.estado AS estado_detalle, n.intentos, n.maxIntentos AS max_intentos,
           n.mensajeError AS mensaje_error, n.idMensajeProveedor AS id_mensaje_proveedor,
           n.fechaCreacion AS fecha_creacion, n.fechaEnvio AS fecha_envio
    FROM notificaciones n`,

  log_auditoria: `
    SELECT a.id AS id_log, a.usuario, a.idUsuario AS id_usuario, a.ip, a.modulo, a.accion,
           a.entidad, a.idEntidad AS id_entidad, a.detalle,
           a.datosAnteriores AS datos_anteriores, a.datosNuevos AS datos_nuevos, a.fecha
    FROM auditoria a`
};

class VistasAnalisisRepository {
  static get nombres() { return Object.keys(VISTAS); }

  /** Crea o actualiza todas; devuelve { creadas, pendientes: [{ vista, motivo }] }. */
  async crearTodas() {
    const pool = await getPool();
    const creadas = [], pendientes = [];
    for (const [nombre, cuerpo] of Object.entries(VISTAS)) {
      try {
        await pool.request().batch(`CREATE OR ALTER VIEW dbo.${nombre} AS ${cuerpo}`);
        creadas.push(nombre);
      } catch (err) {
        pendientes.push({ vista: nombre, motivo: err.message.split('\n')[0] });   // tabla aun no creada
      }
    }
    return { creadas, pendientes };
  }

  /** Filas de cada vista (para verificarlas). */
  async contar() {
    const pool = await getPool();
    const r = {};
    for (const nombre of Object.keys(VISTAS)) {
      r[nombre] = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${nombre}`)).recordset[0].n;
    }
    return r;
  }
}

module.exports = VistasAnalisisRepository;
