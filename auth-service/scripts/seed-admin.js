/**
 * Seed del usuario administrador inicial.
 *
 * En una base de datos recien creada no existe ningun usuario, y como el
 * login es la puerta de entrada a todo el sistema, no habria forma de entrar.
 * Este script crea el primer administrador.
 *
 * Reutiliza las capas ya existentes (AuthService -> UsuarioRepository) en vez
 * de insertar SQL directo, para respetar la arquitectura de 4 capas y que el
 * hash de la password se genere igual que en un registro normal.
 *
 * Uso:
 *   npm run seed
 *
 * Credenciales por defecto (sobrescribibles por variables de entorno):
 *   ADMIN_EMAIL=admin@asilo.gt  ADMIN_PASSWORD=Admin12345
 *
 * Es idempotente: si el usuario ya existe, no hace nada.
 */
require('dotenv').config();

const { inicializarEsquema } = require('../src/repositories/database');
const UsuarioRepository = require('../src/repositories/UsuarioRepository');
const AuthService = require('../src/services/AuthService');

const ADMIN = {
  nombre: process.env.ADMIN_NOMBRE || 'Administrador del Sistema',
  email: process.env.ADMIN_EMAIL || 'admin@asilo.gt',
  password: process.env.ADMIN_PASSWORD || 'Admin12345',
  rol: 'admin'
};

async function main() {
  await inicializarEsquema();

  const usuarioRepository = new UsuarioRepository();
  const authService = new AuthService(usuarioRepository);

  const existente = await usuarioRepository.obtenerPorEmail(ADMIN.email);
  if (existente) {
    console.log(`El usuario "${ADMIN.email}" ya existe (rol: ${existente.rol}). No se hizo nada.`);
    return;
  }

  const creado = await authService.registrar(ADMIN);
  console.log('Usuario administrador creado:');
  console.log(`  email:    ${creado.email}`);
  console.log(`  rol:      ${creado.rol}`);
  console.log(`  password: ${ADMIN.password}`);
  console.log('\nCambiala despues del primer login.');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error creando el usuario administrador:', err.message);
    process.exit(1);
  });
