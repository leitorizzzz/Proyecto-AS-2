const HashPool = require('./hashPool');
const { validarPassword } = require('./reglasPassword');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');

const ROLES_VALIDOS = [
  'enfermero',
  'medico',
  'medico_general',
  'especialista',
  'medico_especialista',
  'farmacia',
  'laboratorio',
  'admin',
  'fundacion',
  'coordinador_fundacion'
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas de autenticacion: registro (con hash de password),
 * login (verificacion + emision de JWT) y validacion de tokens.
 */
class AuthService {
  constructor(usuarioRepository, hasher = AuthService.hasherCompartido(), tokenRevocadoRepository = null) {
    this.usuarioRepo = usuarioRepository;
    this.tokensRevocados = tokenRevocadoRepository;
    // bcrypt en hilos de trabajo (caso 25); mismo algoritmo y costo.
    this.hasher = hasher;
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET no está configurado en .env');
    }
  }

  async registrar({ nombre, email, password, rol }) {
    if (!nombre || nombre.trim() === '') throw new Error('El nombre es requerido');
    if (!email || !EMAIL_REGEX.test(email)) throw new Error('El email no es válido');
    // Misma regla que el restablecimiento por recuperacion (reglasPassword.js).
    validarPassword(password);
    if (!ROLES_VALIDOS.includes(rol)) {
      throw new Error(`Rol inválido. Debe ser uno de: ${ROLES_VALIDOS.join(', ')}`);
    }

    const existente = await this.usuarioRepo.obtenerPorEmail(email);
    if (existente) throw new Error('Ya existe un usuario con ese email');

    const passwordHash = await this.hasher.hash(password, 10);
    const usuario = new Usuario({ nombre, email, passwordHash, rol });
    const creado = await this.usuarioRepo.guardar(usuario);
    return creado.toPublic();
  }

  async login({ email, password }) {
    // 400 (no 401): una peticion incompleta no es un intento de contrasena
    // y no debe sumar al limite de intentos.
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      throw Object.assign(new Error('Escriba su correo y su contraseña'), { status: 400 });
    }

    const usuario = await this.usuarioRepo.obtenerPorEmail(email);
    if (!usuario) throw new Error('Credenciales inválidas');

    const ok = await this.hasher.compare(password, usuario.passwordHash);
    if (!ok) throw new Error('Credenciales inválidas');
    // Se valida despues de la password para no revelar que la cuenta existe.
    if (usuario.activo === false) {
      throw Object.assign(
        new Error('Cuenta desactivada. Pida a administracion que la reactive.'),
        { status: 403 }
      );
    }

    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, rol: usuario.rol },
      this.jwtSecret,
      // jti: identifica el token para poder revocarlo al cerrar sesion (caso 1).
      { expiresIn: this.jwtExpiresIn, jwtid: crypto.randomUUID() }
    );

    return { token, usuario: usuario.toPublic() };
  }

  /**
   * Lista usuarios sin passwordHash. `rol` acepta uno o varios separados
   * por coma (p. ej. "medico_especialista,especialista").
   */
  async listarUsuarios({ rol, incluirInactivos = false } = {}) {
    const roles = rol ? String(rol).split(',').map(r => r.trim()).filter(Boolean) : [];
    const invalidos = roles.filter(r => !ROLES_VALIDOS.includes(r));
    if (invalidos.length) {
      throw Object.assign(new Error(`Rol inválido: ${invalidos.join(', ')}`), { status: 400 });
    }
    const usuarios = await this.usuarioRepo.listar({ roles, incluirInactivos });
    return usuarios.map(u => u.toPublic());
  }

  /** Desactiva una cuenta. Un admin no puede desactivarse a si mismo. */
  async desactivarUsuario(id, idSolicitante) {
    const usuario = await this.usuarioRepo.obtenerPorId(Number(id));
    if (!usuario) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    if (Number(id) === Number(idSolicitante)) {
      throw Object.assign(new Error('No puede desactivar su propia cuenta'), { status: 409 });
    }
    if (usuario.activo === false) {
      throw Object.assign(new Error('La cuenta ya está desactivada'), { status: 409 });
    }
    return (await this.usuarioRepo.cambiarActivo(usuario.id, false)).toPublic();
  }

  async reactivarUsuario(id) {
    const usuario = await this.usuarioRepo.obtenerPorId(Number(id));
    if (!usuario) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    if (usuario.activo !== false) {
      throw Object.assign(new Error('La cuenta ya está activa'), { status: 409 });
    }
    return (await this.usuarioRepo.cambiarActivo(usuario.id, true)).toPublic();
  }

  /**
   * Cambio de contrasena por el propio usuario (con sesion): exige la
   * actual y la nueva cumple la misma regla que el alta (reglasPassword.js).
   */
  async cambiarPassword(idUsuario, { passwordActual, passwordNueva } = {}) {
    const usuario = await this.usuarioRepo.obtenerPorId(Number(idUsuario));
    if (!usuario || usuario.activo === false) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
    if (!passwordActual || !await this.hasher.compare(String(passwordActual), usuario.passwordHash)) {
      throw Object.assign(new Error('La contraseña actual no es correcta.'), { status: 400 });
    }
    validarPassword(passwordNueva);
    if (passwordNueva === passwordActual) {
      throw Object.assign(new Error('La contraseña nueva debe ser distinta de la actual.'), { status: 400 });
    }
    await this.usuarioRepo.actualizarPassword(usuario.id, await this.hasher.hash(passwordNueva, 10));
    return usuario.toPublic();
  }

  /**
   * Cierre de sesion (caso 1 del SQA): revoca el token actual. Un JWT
   * copiado antes de salir deja de servir en los 7 servicios aunque su exp
   * no haya vencido. Tokens sin jti (anteriores a este cambio) no se pueden
   * revocar y vencen solos.
   */
  async cerrarSesion({ jti, exp } = {}) {
    if (!jti || !this.tokensRevocados) return { revocado: false };
    await this.tokensRevocados.revocar(jti, new Date(exp * 1000));
    return { revocado: true };
  }

  async obtenerPerfil(idUsuario) {
    const usuario = await this.usuarioRepo.obtenerPorId(idUsuario);
    if (!usuario) throw new Error('Usuario no encontrado');
    return usuario.toPublic();
  }
}

AuthService.hasherCompartido = () => {
  if (!AuthService._pool) AuthService._pool = new HashPool();
  return AuthService._pool;
};

module.exports = AuthService;
