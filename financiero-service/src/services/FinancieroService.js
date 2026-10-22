const CargoServicio = require('../models/CargoServicio');
const CuotaMensual = require('../models/CuotaMensual');
const Donante = require('../models/Donante');
const Donacion = require('../models/Donacion');
const GastoOperativo = require('../models/GastoOperativo');
const PagoFundacion = require('../models/PagoFundacion');

/**
 * CAPA DE LOGICA DE NEGOCIO
 * Reglas del dominio Entradas / Salidas / Caja del asilo.
 * - Estado de cuenta por paciente (cargos + cuotas).
 * - Registro atomico de cuota + pago.
 * - Alerta de saldo cuando supera un umbral configurable.
 */
class FinancieroService {
  constructor(cuentaRepo, donanteRepo, movimientosRepo) {
    this.cuentaRepo = cuentaRepo;
    this.donanteRepo = donanteRepo;
    this.movimientosRepo = movimientosRepo;
    this.umbralAlerta = Number(process.env.UMBRAL_ALERTA_SALDO || 1000);
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
    const alerta = this.generarAlertaSaldo(saldoTotal);
    return { idPaciente, saldoCargos: this._r(saldoCargos), saldoCuotas: this._r(saldoCuotas),
             saldoTotal, alerta, cargos, cuotas };
  }

  async generarCargo({ idPaciente, concepto, monto }) {
    if (!idPaciente) throw Object.assign(new Error('idPaciente es requerido'), { status: 400 });
    if (!concepto || String(concepto).trim() === '')
      throw Object.assign(new Error('concepto es requerido'), { status: 400 });
    if (monto == null || Number(monto) <= 0)
      throw Object.assign(new Error('monto debe ser mayor a 0'), { status: 400 });

    return this.cuentaRepo.guardarCargo(new CargoServicio({
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
        estado: CuotaMensual.ESTADOS.PENDIENTE
      }));
    }
    if (cuota.estado === CuotaMensual.ESTADOS.PAGADA)
      throw Object.assign(
        new Error(`La cuota ${cuota.mes}/${cuota.anio} ya esta pagada`), { status: 409 }
      );
    return this.cuentaRepo.pagarCuota(cuota.id);
  }

  generarAlertaSaldo(saldoTotal) {
    if (saldoTotal >= this.umbralAlerta) {
      return {
        nivel: 'alto',
        mensaje: `Saldo pendiente Q${this._r(saldoTotal)} supera el umbral Q${this.umbralAlerta}`
      };
    }
    if (saldoTotal > 0) {
      return { nivel: 'bajo', mensaje: `Saldo pendiente Q${this._r(saldoTotal)}` };
    }
    return null;
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
