const CargoServicio = require('../models/CargoServicio');
const CuotaMensual = require('../models/CuotaMensual');
const Donante = require('../models/Donante');
const Donacion = require('../models/Donacion');
const GastoOperativo = require('../models/GastoOperativo');
const PagoFundacion = require('../models/PagoFundacion');
const { asegurarTitularCompleto } = require('./reglasCuenta');
const alertasCobro = require('./alertasCobro');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas del dominio Entradas / Salidas / Caja del asilo.
 * - Estado de cuenta por paciente (cargos + cuotas).
 * - Registro atomico de cuota + pago.
 * - Alertas de cobro naranja / roja por saldo y cuotas vencidas (caso 21).
 */
class FinancieroService {
  constructor(cuentaRepo, donanteRepo, movimientosRepo, familiarRepo) {
    this.cuentaRepo = cuentaRepo;
    this.donanteRepo = donanteRepo;
    this.movimientosRepo = movimientosRepo;
    this.familiarRepo = familiarRepo;
    this.umbralAlerta = Number(process.env.UMBRAL_ALERTA_SALDO || 1000);
    this.configAlertas = alertasCobro.configAlertas();
    // Inyectable en pruebas; en produccion es la fecha de hoy en Guatemala.
    this.hoy = () => alertasCobro.hoyGuatemala();
  }

  // --- Cuenta del paciente ---

  async estadoCuenta(idPaciente) {
    const [cargos, cuotas, saldoCargos, saldoCuotas] = await Promise.all([
      this.cuentaRepo.listarCargosPorPaciente(idPaciente),
      this.cuentaRepo.cuotasPorPaciente(idPaciente),
      this.cuentaRepo.saldoPendientePorPaciente(idPaciente),
      this.cuentaRepo.saldoCuotasPendientes(idPaciente)
    ]);
    const saldoTotal = this._r(saldoCargos + saldoCuotas);
    const alerta = this.generarAlertaSaldo(saldoTotal, cuotas);
    const familiar = this.familiarRepo ? await this.familiarRepo.obtenerPrincipal(idPaciente) : null;
    return { idPaciente, saldoCargos: this._r(saldoCargos), saldoCuotas: this._r(saldoCuotas),
             saldoTotal, alerta, familiar, cargos,
             cuotas: cuotas.map(c => ({ ...c, diasMora: alertasCobro.diasMora(c, this.hoy()) })) };
  }

  /** Caso 21: cuentas con alerta naranja o roja, las rojas primero. */
  async alertasCobro() {
    const hoy = this.hoy();
    const cuentas = await this.cuentaRepo.cuentasPorCobrar();
    const orden = { roja: 0, naranja: 1 };
    return cuentas
      .map(c => {
        const saldoTotal = this._r(c.saldoCargos + c.saldoCuotas);
        return { idPaciente: c.idPaciente, paciente: c.paciente, activo: c.activo,
                 saldoCargos: this._r(c.saldoCargos), saldoCuotas: this._r(c.saldoCuotas), saldoTotal,
                 alerta: this.generarAlertaSaldo(saldoTotal, c.cuotas, hoy) };
      })
      .filter(c => c.alerta)
      .sort((a, b) => orden[a.alerta.nivel] - orden[b.alerta.nivel] || b.saldoTotal - a.saldoTotal);
  }

  /**
   * Caso 21: emite la cuota del periodo como pendiente (sin pagarla). Su
   * vencimiento por defecto es el ultimo dia del mes.
   */
  async emitirCuota({ idPaciente, mes, anio, monto, fechaVencimiento }) {
    if (!idPaciente || !mes || !anio)
      throw Object.assign(new Error('idPaciente, mes y anio son requeridos'), { status: 400 });
    if (!Number.isInteger(Number(mes)) || Number(mes) < 1 || Number(mes) > 12)
      throw Object.assign(new Error('mes debe estar entre 1 y 12'), { status: 400 });
    if (monto == null || !(Number(monto) > 0))
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });
    if (fechaVencimiento && (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaVencimiento)) || isNaN(Date.parse(fechaVencimiento))))
      throw Object.assign(new Error('fechaVencimiento debe tener formato YYYY-MM-DD'), { status: 400 });
    asegurarTitularCompleto(
      this.familiarRepo ? await this.familiarRepo.obtenerPrincipal(Number(idPaciente)) : null, idPaciente);
    if (await this.cuentaRepo.obtenerCuota(Number(idPaciente), Number(mes), Number(anio)))
      throw Object.assign(new Error(`La cuota ${mes}/${anio} del paciente ${idPaciente} ya existe`), { status: 409 });
    return this.cuentaRepo.guardarCuota(new CuotaMensual({
      idPaciente: Number(idPaciente), mes: Number(mes), anio: Number(anio), monto: Number(monto),
      estado: CuotaMensual.ESTADOS.PENDIENTE,
      fechaVencimiento: fechaVencimiento || alertasCobro.vencimientoPorDefecto(mes, anio)
    }));
  }

  async generarCargo({ idPaciente, concepto, monto }) {
    if (!idPaciente) throw Object.assign(new Error('idPaciente es requerido'), { status: 400 });
    if (!concepto || String(concepto).trim() === '')
      throw Object.assign(new Error('concepto es requerido'), { status: 400 });
    if (monto == null || Number(monto) <= 0)
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });
    // Caso 20: la cuenta es del familiar responsable; debe estar completo.
    const titular = asegurarTitularCompleto(
      this.familiarRepo ? await this.familiarRepo.obtenerPrincipal(Number(idPaciente)) : null, idPaciente);

    return this.cuentaRepo.guardarCargo(new CargoServicio({
      idFamiliar: titular.id,
      idPaciente: Number(idPaciente),
      concepto: String(concepto).trim(),
      monto: Number(monto),
      estado: CargoServicio.ESTADOS.PENDIENTE
    }));
  }

  async obtenerCargo(id) {
    const cargo = await this.cuentaRepo.obtenerCargo(Number(id));
    if (!cargo) throw Object.assign(new Error('Cargo no encontrado'), { status: 404 });
    return cargo;
  }

  /**
   * Caso 20: abono a un cargo. Nunca deja el saldo negativo: un abono mayor
   * que lo que falta se rechaza (409), no se trunca.
   */
  async registrarAbono(idCargo, { monto, concepto } = {}, idUsuario = null) {
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0 || Math.abs(Math.round(m * 100) - m * 100) > 1e-6) {
      throw Object.assign(new Error('monto debe ser mayor a 0 y con maximo 2 decimales'), { status: 400 });
    }
    const cargo = await this.cuentaRepo.obtenerCargo(Number(idCargo));
    if (!cargo) throw Object.assign(new Error('Cargo no encontrado'), { status: 404 });
    if (cargo.estado === CargoServicio.ESTADOS.PAGADO || cargo.saldo <= 0) {
      throw Object.assign(new Error(`El cargo ${cargo.id} ya esta pagado`), { status: 409 });
    }
    if (m > cargo.saldo) {
      throw Object.assign(
        new Error(`El abono Q${m.toFixed(2)} excede el saldo del cargo (Q${cargo.saldo.toFixed(2)}): no se permiten saldos negativos`),
        { status: 409 }
      );
    }
    const r = await this.cuentaRepo.registrarAbono(cargo.id, { monto: m, concepto, idUsuario });
    if (!r) {
      // Otro abono simultaneo dejo menos saldo del que se valido arriba.
      throw Object.assign(new Error('El saldo del cargo cambio; el abono excederia el saldo'), { status: 409 });
    }
    return { ...r.cargo, abono: r.abono };
  }

  async registrarPagoCuota({ idPaciente, mes, anio, monto }) {
    if (!idPaciente || !mes || !anio)
      throw Object.assign(new Error('idPaciente, mes y anio son requeridos'), { status: 400 });
    if (Number(mes) < 1 || Number(mes) > 12)
      throw Object.assign(new Error('mes debe estar entre 1 y 12'), { status: 400 });
    asegurarTitularCompleto(
      this.familiarRepo ? await this.familiarRepo.obtenerPrincipal(Number(idPaciente)) : null, idPaciente);

    // Crear cuota si no existe (idempotente para el (idPaciente,mes,anio))
    let cuota = await this.cuentaRepo.obtenerCuota(Number(idPaciente), Number(mes), Number(anio));
    if (!cuota) {
      if (monto == null || Number(monto) <= 0)
        throw Object.assign(new Error('monto requerido al crear una cuota nueva'), { status: 400 });
      cuota = await this.cuentaRepo.guardarCuota(new CuotaMensual({
        idPaciente: Number(idPaciente),
        mes: Number(mes),
        anio: Number(anio),
        monto: Number(monto),
        estado: CuotaMensual.ESTADOS.PENDIENTE,
        fechaVencimiento: alertasCobro.vencimientoPorDefecto(mes, anio)
      }));
    }
    if (cuota.estado === CuotaMensual.ESTADOS.PAGADA)
      throw Object.assign(
        new Error(`La cuota ${cuota.mes}/${cuota.anio} ya esta pagada`), { status: 409 }
      );
    return this.cuentaRepo.pagarCuota(cuota.id);
  }

  /** Caso 21: alerta naranja / roja por saldo y cuotas vencidas (ver alertasCobro). */
  generarAlertaSaldo(saldoTotal, cuotas = [], hoy = this.hoy()) {
    return alertasCobro.evaluarAlerta({ saldoTotal, cuotas, hoy, config: this.configAlertas });
  }

  // --- Donantes / donaciones ---

  async registrarDonante({ nombre, telefono, email, direccion }) {
    if (!nombre || String(nombre).trim() === '')
      throw Object.assign(new Error('nombre es requerido'), { status: 400 });
    return this.donanteRepo.guardarDonante(new Donante({
      nombre: String(nombre).trim(), telefono, email, direccion
    }));
  }

  listarDonantes({ incluirInactivos = false } = {}) {
    return this.donanteRepo.listarDonantes({ incluirInactivos });
  }

  async obtenerDonante(id) {
    const donante = await this.donanteRepo.obtenerDonante(Number(id));
    if (!donante) throw Object.assign(new Error('Donante no encontrado'), { status: 404 });
    return donante;
  }

  async desactivarDonante(id) {
    const donante = await this.donanteRepo.obtenerDonante(Number(id));
    if (!donante) throw Object.assign(new Error('Donante no encontrado'), { status: 404 });
    if (donante.activo === false) {
      throw Object.assign(new Error('El donante ya esta desactivado'), { status: 409 });
    }
    return this.donanteRepo.cambiarActivoDonante(donante.id, false);
  }

  async reactivarDonante(id) {
    const donante = await this.donanteRepo.obtenerDonante(Number(id));
    if (!donante) throw Object.assign(new Error('Donante no encontrado'), { status: 404 });
    if (donante.activo !== false) {
      throw Object.assign(new Error('El donante ya esta activo'), { status: 409 });
    }
    return this.donanteRepo.cambiarActivoDonante(donante.id, true);
  }

  async registrarDonacion({ idDonante, monto, tipo, concepto }) {
    if (!idDonante) throw Object.assign(new Error('idDonante es requerido'), { status: 400 });
    if (monto == null || Number(monto) <= 0)
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });
    if (tipo && !Donacion.TIPOS.includes(tipo))
      throw Object.assign(new Error(`tipo debe ser uno de: ${Donacion.TIPOS.join(', ')}`), { status: 400 });

    const donante = await this.donanteRepo.obtenerDonante(Number(idDonante));
    if (!donante) throw Object.assign(new Error('Donante no encontrado'), { status: 404 });
    if (donante.activo === false) {
      throw Object.assign(
        new Error(`El donante ${donante.nombre} esta desactivado: no se le pueden registrar donaciones`),
        { status: 409 }
      );
    }

    return this.donanteRepo.guardarDonacion(new Donacion({
      idDonante: Number(idDonante),
      monto: Number(monto),
      tipo: tipo || 'dinero',
      concepto: concepto || null
    }));
  }

  listarDonaciones(filtros) { return this.donanteRepo.listarDonaciones(filtros); }

  // --- Gastos operativos ---

  async registrarGasto({ concepto, monto, categoria }) {
    if (!concepto) throw Object.assign(new Error('concepto es requerido'), { status: 400 });
    if (monto == null || Number(monto) <= 0)
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });
    if (categoria && !GastoOperativo.CATEGORIAS.includes(categoria))
      throw Object.assign(
        new Error(`categoria debe ser una de: ${GastoOperativo.CATEGORIAS.join(', ')}`),
        { status: 400 }
      );
    return this.movimientosRepo.guardarGasto(new GastoOperativo({
      concepto, monto: Number(monto), categoria: categoria || 'otros'
    }));
  }

  listarGastos(filtros) { return this.movimientosRepo.listarGastos(filtros); }

  // --- Pagos a fundacion ---

  async registrarPagoFundacion({ monto, concepto }) {
    if (!concepto) throw Object.assign(new Error('concepto es requerido'), { status: 400 });
    if (monto == null || Number(monto) <= 0)
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });
    return this.movimientosRepo.guardarPagoFundacion(new PagoFundacion({
      monto: Number(monto), concepto
    }));
  }

  listarPagosFundacion(filtros) { return this.movimientosRepo.listarPagosFundacion(filtros); }

  _r(n) { return Math.round(Number(n) * 100) / 100; }
}

module.exports = FinancieroService;
