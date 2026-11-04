const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticacion por JWT.
 * Valida el header "Authorization: Bearer <token>" firmado con JWT_SECRET
 * y adjunta el payload decodificado a req.usuario.
 *
 * Cierre de sesion (caso 1 del SQA): si el token trae jti y aparece en
 * tokens_revocados, responde 401 aunque la firma y el exp sean validos. Los
 * revocados se recuerdan en memoria hasta su vencimiento; los demas se
 * consultan por clave primaria en cada peticion (una lectura indexada).
 *
 * Este archivo se copia identico en cada microservicio (farmacia-service,
 * pacientes-service, etc.) — el unico contrato compartido es el JWT_SECRET.
 */
// Carga perezosa: el acceso a datos (mssql) solo se carga cuando llega un
// token con jti; las pruebas de rutas con tokens simples no lo necesitan.
let revocacion = null;
const repositorio = () => (revocacion ||= new (require('../repositories/TokenRevocadoRepository'))());
const revocadosEnMemoria = new Map();   // jti -> vencimiento (ms)

async function tokenRevocado(payload) {
  if (!payload.jti) return false;       // tokens sin jti: de servicio o anteriores
  const ahora = Date.now();
  for (const [jti, vence] of revocadosEnMemoria) if (vence < ahora) revocadosEnMemoria.delete(jti);
  if (revocadosEnMemoria.has(payload.jti)) return true;
  try {
    if (await repositorio().estaRevocado(payload.jti)) {
      revocadosEnMemoria.set(payload.jti, payload.exp * 1000);
      return true;
    }
  } catch (err) {
    // Tabla aun no creada (auth-service arranca despues) o BD caida: no se
    // bloquea la operacion por esto; la firma y el exp ya se verificaron.
    console.warn(`[auth] no se pudo consultar tokens_revocados: ${err.message}`);
  }
  return false;
}

async function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  if (await tokenRevocado(payload)) {
    return res.status(401).json({ error: 'Token revocado: la sesión se cerró. Vuelva a iniciar sesión.' });
  }
  req.usuario = payload; // { sub, email, rol, jti, iat, exp }
  next();
}

autenticar.marcarRevocado = (jti, expSeg) => revocadosEnMemoria.set(jti, expSeg * 1000);
module.exports = autenticar;
