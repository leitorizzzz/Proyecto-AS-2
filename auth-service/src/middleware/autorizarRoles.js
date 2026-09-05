/**
 * Middleware de autorizacion por rol.
 *
 * Se usa SIEMPRE despues de authMiddleware (autenticar), que es quien valida
 * el JWT y deja el payload en req.usuario. Este solo compara el rol.
 *
 * Uso:
 *   router.post('/register', autenticar, autorizarRoles('admin'), ctrl.register);
 */
function autorizarRoles(...rolesPermitidos) {
  return function (req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere uno de los roles: ${rolesPermitidos.join(', ')}`
      });
    }

    next();
  };
}

module.exports = autorizarRoles;
