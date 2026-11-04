/**
 * CAPA DE LOGICA DE NEGOCIO — alertas de cobro (caso 21).
 *
 * Nivel de alerta de la cuenta de un paciente, a partir del saldo total y
 * de sus cuotas pendientes:
 *   roja    saldo >= UMBRAL_ALERTA_SALDO, o una cuota vencida hace mas de
 *           DIAS_MORA_ROJA dias.
 *   naranja saldo >= UMBRAL_ALERTA_NARANJA, o alguna cuota vencida.
 *   null    sin saldo relevante ni cuotas vencidas.
 * Una cuota vence en su fechaVencimiento (por defecto, el ultimo dia de su
 * mes); a partir del dia siguiente cuenta mora.
 */
const NIVELES = Object.freeze({ NARANJA: 'naranja', ROJA: 'roja' });
const MS_DIA = 24 * 60 * 60 * 1000;

function configAlertas(env = process.env) {
  const umbralRoja = Number(env.UMBRAL_ALERTA_SALDO || 1000);
  return {
    umbralRoja,
    umbralNaranja: Number(env.UMBRAL_ALERTA_NARANJA || umbralRoja / 2),
    diasMoraRoja: Number(env.DIAS_MORA_ROJA || 30)
  };
}

/** YYYY-MM-DD de hoy en Guatemala (UTC-6, sin horario de verano). */
function hoyGuatemala(ahora = Date.now()) {
  return new Date(ahora - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Ultimo dia del mes de la cuota, YYYY-MM-DD. */
function vencimientoPorDefecto(mes, anio) {
  return new Date(Date.UTC(Number(anio), Number(mes), 0)).toISOString().slice(0, 10);
}

function _fecha(f) {
  if (!f) return null;
  return f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10);
}

/** Dias de mora de una cuota pendiente a la fecha hoy (0 si no vencio). */
function diasMora(cuota, hoy) {
  if (cuota.estado !== 'pendiente' && cuota.estado !== 'vencida') return 0;
  const vence = _fecha(cuota.fechaVencimiento) || vencimientoPorDefecto(cuota.mes, cuota.anio);
  const d = Math.round((Date.parse(hoy) - Date.parse(vence)) / MS_DIA);
  return d > 0 ? d : 0;
}

function _q(n) { return `Q${(Math.round(Number(n) * 100) / 100).toFixed(2)}`; }

function evaluarAlerta({ saldoTotal, cuotas = [], hoy, config = configAlertas() }) {
  const vencidas = cuotas.map(c => ({ c, dias: diasMora(c, hoy) })).filter(x => x.dias > 0);
  const diasMoraMax = vencidas.reduce((m, x) => Math.max(m, x.dias), 0);
  const motivos = [];
  let nivel = null;
  const subir = n => { if (n === NIVELES.ROJA || !nivel) nivel = n; };

  if (saldoTotal >= config.umbralRoja) {
    subir(NIVELES.ROJA);
    motivos.push(`saldo ${_q(saldoTotal)} supera el umbral ${_q(config.umbralRoja)}`);
  } else if (saldoTotal >= config.umbralNaranja) {
    subir(NIVELES.NARANJA);
    motivos.push(`saldo ${_q(saldoTotal)} cerca del umbral (${_q(config.umbralNaranja)} o mas)`);
  }
  if (vencidas.length) {
    subir(diasMoraMax > config.diasMoraRoja ? NIVELES.ROJA : NIVELES.NARANJA);
    const lista = vencidas.map(x => `${x.c.mes}/${x.c.anio} (${x.dias} d)`).join(', ');
    motivos.push(`${vencidas.length} cuota(s) vencida(s): ${lista}`);
  }
  if (!nivel) return null;
  return {
    nivel,
    motivos,
    mensaje: `${nivel === NIVELES.ROJA ? 'Alerta roja' : 'Alerta naranja'}: ${motivos.join('; ')}`,
    cuotasVencidas: vencidas.length,
    diasMoraMax
  };
}

module.exports = { NIVELES, configAlertas, hoyGuatemala, vencimientoPorDefecto, diasMora, evaluarAlerta };
