#!/usr/bin/env node
/*
 * Apoyo para la demo (RF-42): imprime el enlace de restablecimiento de
 * contrasena VIGENTE de un correo, leyendo la base del stack LOCAL con
 * docker exec. No pasa por ninguna API ni cambia nada en la base.
 *
 * En el prototipo el envio de correo es simulado (MODO_SIMULACION=true): el
 * enlace no llega a ningun buzon, queda en el cuerpo del correo guardado en
 * la tabla notificaciones. tokens_recuperacion solo guarda el hash SHA-256
 * del token, asi que el enlace se toma del correo y se valida contra ese
 * hash: se imprime solo si no se uso, no vencio y la cuenta esta activa.
 *
 * Uso:
 *   npm run enlace-recuperacion -- usuario@asilo.gt
 *
 * Sale con 0 si imprime un enlace, 1 si no hay ninguno vigente y 2 ante un
 * error (correo invalido, sin docker o sin el contenedor asilo-sqlserver).
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const CONTENEDOR = 'asilo-sqlserver';
// Mismo patron que auth-service (32 bytes en base64url) dentro del enlace.
const ENLACE = /https?:\/\/[^\s"'<>]+#restablecer=([A-Za-z0-9_-]{43})/g;

// opciones: '-y 0' (ancho sin limite, para el cuerpo del correo; sqlcmd no la
// admite junto con -h ni -W) o '-h -1 -W' (un valor por linea, sin encabezado).
function sql(consulta, opciones) {
  // La contrasena de sa la toma el propio contenedor de su entorno.
  return execFileSync('docker', ['exec', CONTENEDOR, 'sh', '-c',
    `SQLCMD=$(ls /opt/mssql-tools*/bin/sqlcmd | head -1); $SQLCMD -b -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d AsiloCabezaAlgodon ${opciones} -Q "$0"`, consulta],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@'";]+@[^\s@'";]+\.[^\s@'";]+$/.test(email)) {
    console.error('Uso: npm run enlace-recuperacion -- <correo>');
    return 2;
  }

  // Correos de recuperacion a ese destinatario, del mas reciente al mas antiguo.
  let cuerpos;
  try {
    cuerpos = sql(`SET NOCOUNT ON; SELECT TOP 20 cuerpo FROM notificaciones
      WHERE LOWER(destinatarioEmail) = '${email}' AND tipoEvento = 'recuperacion_password'
      ORDER BY id DESC`, '-y 0');
  } catch (e) {
    console.error(`No se pudo consultar la base local (${(e.stderr || e.message).split('\n')[0].trim()}).`);
    console.error(`Requiere docker y el stack arriba (contenedor ${CONTENEDOR}).`);
    return 2;
  }
  const enlaces = [...cuerpos.matchAll(ENLACE)].map(m => ({ enlace: m[0], token: m[1] }));

  for (const { enlace, token } of enlaces) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    // Mismas condiciones que RecuperacionService al restablecer.
    const fila = sql(`SET NOCOUNT ON; SELECT DATEDIFF(MINUTE, SYSUTCDATETIME(), t.expira)
      FROM tokens_recuperacion t INNER JOIN usuarios u ON u.id = t.idUsuario
      WHERE t.tokenHash = '${hash}' AND t.usado IS NULL AND t.expira > SYSUTCDATETIME()
        AND u.activo = 1 AND LOWER(u.email) = '${email}'`, '-h -1 -W').trim();
    if (fila) {
      console.log(enlace);
      console.log(`Vigente: vence en ${Math.max(Number(fila), 0)} min y sirve una sola vez.`);
      return 0;
    }
  }
  console.log(`No hay ningún enlace de restablecimiento vigente para ${email}.`);
  console.log(enlaces.length
    ? `(${enlaces.length} enlace(s) anterior(es): ya usados, vencidos o reemplazados por uno más nuevo.)`
    : '(No se ha pedido recuperación para ese correo, o la cuenta no existe.)');
  return 1;
}

process.exitCode = main();
