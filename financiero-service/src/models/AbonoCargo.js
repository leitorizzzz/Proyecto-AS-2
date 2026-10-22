/**
 * CAPA DE ENTIDADES / MODELOS
 * Abono (pago parcial o total) a un cargo de la cuenta del familiar.
 * La suma de abonos de un cargo nunca supera su monto: el saldo no puede
 * quedar negativo (caso 20; tambien lo impide el CHECK de cargos_servicio).
 */
class AbonoCargo {
  constructor({ id, idCargo, monto, concepto, idUsuario, fecha }) {
    this.id = id || null;
    this.idCargo = idCargo;
    this.monto = Number(monto);
    this.concepto = concepto || null;
    this.idUsuario = idUsuario ?? null;
    this.fecha = fecha || null;
  }
}
module.exports = AbonoCargo;
