/**
 * Manejo de errores HTTP (auditoria SQA, 26 oct).
 *
 * - ocultarErrores500: si una respuesta sale con status >= 500, el cliente
 *   recibe un mensaje generico y el detalle (mensaje de SQL Server, rutas)
 *   queda solo en el log del contenedor. Antes un monto "cien" devolvia
 *   "Cannot insert the value NULL into column 'monto', table ...".
 * - manejadorErrores: errores que Express no entrega a un controlador
 *   (JSON malformado, cuerpo demasiado grande) responden en JSON y en
 *   espanol; antes Express devolvia su pagina HTML con la traza completa.
 *
 * Este archivo se copia identico en los 7 servicios, como autorizarRoles.
 */
const MENSAJE_500 = 'Ocurrió un error interno. Intente de nuevo; si persiste, avise a administración.';

function ocultarErrores500(req, res, next) {
  const json = res.json.bind(res);
  res.json = cuerpo => {
    if (res.statusCode >= 500 && cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo) {
      console.error(`[error ${res.statusCode}] ${req.method} ${req.originalUrl}: ${cuerpo.error}`);
      return json({ error: MENSAJE_500 });
    }
    return json(cuerpo);
  };
  next();
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande' });
  }
  const status = err.status || err.statusCode || 500;
  if (status < 500) return res.status(status).json({ error: err.message });
  console.error(`[error ${status}] ${req.method} ${req.originalUrl}:`, err);
  return res.status(status).json({ error: MENSAJE_500 });
}

module.exports = { ocultarErrores500, manejadorErrores, MENSAJE_500 };
