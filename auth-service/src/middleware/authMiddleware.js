const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticacion por JWT.
 * Valida el header "Authorization: Bearer <token>" firmado con JWT_SECRET
 * y adjunta el payload decodificado a req.usuario.
 *
 * Este archivo se copia identico en cada microservicio (farmacia-service,
 * pacientes-service, etc.) — el unico contrato compartido es el JWT_SECRET.
 */
function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { sub, email, rol, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

module.exports = autenticar;
