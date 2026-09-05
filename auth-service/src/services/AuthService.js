const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const ROLES_VALIDOS = ['enfermero', 'medico', 'especialista', 'farmacia', 'laboratorio', 'admin', 'fundacion'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas de autenticacion: registro (con hash de password),
 * login (verificacion + emision de JWT) y validacion de tokens.
 */
class AuthService {
  constructor(usuarioRepository) {
    this.usuarioRepo = usuarioRepository;
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET no esta configurado en .env');
    }
  }

  async registrar({ nombre, email, password, rol }) {
    if (!nombre || nombre.trim() === '') throw new Error('El nombre es requerido');
    if (!email || !EMAIL_REGEX.test(email)) throw new Error('El email no es valido');
    if (!password || password.length < 6) throw new Error('La password debe tener al menos 6 caracteres');
    if (!ROLES_VALIDOS.includes(rol)) {
      throw new Error(`Rol invalido. Debe ser uno de: ${ROLES_VALIDOS.join(', ')}`);
    }

    const existente = await this.usuarioRepo.obtenerPorEmail(email);
    if (existente) throw new Error('Ya existe un usuario con ese email');

    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = new Usuario({ nombre, email, passwordHash, rol });
    const creado = await this.usuarioRepo.guardar(usuario);
    return creado.toPublic();
  }

  async login({ email, password }) {
    if (!email || !password) throw new Error('Email y password son requeridos');

    const usuario = await this.usuarioRepo.obtenerPorEmail(email);
    if (!usuario) throw new Error('Credenciales invalidas');

    const ok = await bcrypt.compare(password, usuario.passwordHash);
    if (!ok) throw new Error('Credenciales invalidas');

    const token = jwt.sign(
      { sub: usuario.id, email: usuario.email, rol: usuario.rol },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );

    return { token, usuario: usuario.toPublic() };
  }

  async obtenerPerfil(idUsuario) {
    const usuario = await this.usuarioRepo.obtenerPorId(idUsuario);
    if (!usuario) throw new Error('Usuario no encontrado');
    return usuario.toPublic();
  }
}

module.exports = AuthService;
