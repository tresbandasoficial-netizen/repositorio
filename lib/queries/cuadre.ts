import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago, METODO_PAGO_LABELS, labelMetodo, metodosDeSede, cuentasAcumuladoAsesor } from '@/types'
import { hoyBogota } from '@/lib/utils/format'

// Efectivo acumulado que DEBE haber en la caja de cada sede:
//   saldo_inicial + (efectivo que entró − efectivo que salió) desde el corte.
// Es lo mismo que muestra el flujo de caja para las cuentas de efectivo, pero
// accesible para los asesores en su cuadre (para saber cuánto deben tener).
export type EfectivoEnCaja = { cuenta_id: string; nombre: string; sede_codigo: string; saldo: number }

export async function getEfectivoEnCaja(filtroSedeCodigo?: string): Promise<EfectivoEnCaja[]> {
  const supabase = await createClient()
  const sesion = await getSesion()

  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo')
  const sedes = (sedesRaw ?? []) as Array<{ id: string; codigo: string }>
  const codigoPorId = new Map(sedes.map(s => [s.id, s.codigo]))

  const esAdmin = sesion.rol === 'admin'
  const sedeForzadaId = !esAdmin && sesion.sede_id ? sesion.sede_id : null

  // Cajas de efectivo OPERATIVAS (las que reciben ventas: metodo_pago='efectivo').
  // Se excluye la caja del dueño (metodo_pago=null) — esa no la maneja el asesor.
  let qc = supabase
    .from('cuentas')
    .select('id, nombre, sede_id, saldo_inicial, fecha_corte')
    .eq('tipo', 'efectivo')
    .eq('metodo_pago', 'efectivo')
    .eq('activa', true)
    .order('orden')
  if (sedeForzadaId) qc = qc.eq('sede_id', sedeForzadaId)
  else if (filtroSedeCodigo) {
    const sid = sedes.find(s => s.codigo === filtroSedeCodigo)?.id
    if (sid) qc = qc.eq('sede_id', sid)
  }
  const cuentas = ((await qc).data ?? []) as Array<{ id: string; nombre: string; sede_id: string; saldo_inicial: number; fecha_corte: string | null }>
  if (cuentas.length === 0) return []

  const ids = cuentas.map(c => c.id)
  const cortes = cuentas.map(c => c.fecha_corte).filter(Boolean) as string[]
  const corteMin = cortes.length ? cortes.sort()[0] : hoyBogota()

  const [pagosR, pfR, gastosR, pmR, trR] = await Promise.all([
    supabase.from('pagos').select('cuenta_id, monto, fecha').in('cuenta_id', ids).neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_factura').select('cuenta_id, monto, fecha').in('cuenta_id', ids).neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('gastos').select('cuenta_id, valor, fecha').in('cuenta_id', ids).gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_mensajeria').select('cuenta_id, monto, fecha, tipo').in('cuenta_id', ids).eq('tipo', 'pago').gte('fecha', corteMin).limit(20000),
    supabase.from('traslados_caja').select('origen_cuenta_id, destino_cuenta_id, monto, fecha').gte('fecha', corteMin).limit(20000),
  ])
  const pagos    = (pagosR.data  ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const pf       = (pfR.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const gastos   = (gastosR.data ?? []) as Array<{ cuenta_id: string | null; valor: number; fecha: string }>
  const pm       = (pmR.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const tr       = (trR.data     ?? []) as Array<{ origen_cuenta_id: string | null; destino_cuenta_id: string; monto: number; fecha: string }>

  return cuentas.map(c => {
    const corte = c.fecha_corte || hoyBogota()
    let ing = 0, eg = 0
    for (const p of pagos)  if (p.cuenta_id === c.id && p.fecha >= corte) ing += p.monto
    for (const p of pf)     if (p.cuenta_id === c.id && p.fecha >= corte) ing += p.monto
    for (const p of pm)     if (p.cuenta_id === c.id && p.fecha >= corte) ing += p.monto
    for (const t of tr)     if (t.destino_cuenta_id === c.id && t.fecha >= corte) ing += t.monto
    for (const g of gastos) if (g.cuenta_id === c.id && g.fecha >= corte) eg += g.valor
    for (const t of tr)     if (t.origen_cuenta_id === c.id && t.fecha >= corte) eg += t.monto
    return { cuenta_id: c.id, nombre: c.nombre, sede_codigo: codigoPorId.get(c.sede_id) ?? '', saldo: c.saldo_inicial + ing - eg }
  })
}

// Saldo acumulado de TODAS las cuentas de dinero real (efectivo de la sede +
// cuentas electrónicas globales: Nequi, Bancolombia, Bold, Addi…). Igual que
// getEfectivoEnCaja pero sin limitarse al efectivo.
//
// Usa el admin client a propósito: las cuentas electrónicas son globales
// (sede_id = null) y reciben dinero de varias sedes; con el cliente de usuario
// (RLS) un asesor solo vería los movimientos de su sede y el saldo saldría
// incompleto. Así el saldo de cada cuenta es el real y completo.
export type SaldoCuenta = {
  cuenta_id: string
  nombre: string
  tipo: string
  sede_codigo: string | null   // null = cuenta global (no es de una sede)
  es_efectivo: boolean
  hoy: number       // recogido en el período (lo que entró por ventas)
  total: number     // acumulado = base + hoy (saldo inicial + ingresos − egresos)
  verTotal: boolean // si el usuario puede ver el acumulado de ESTA cuenta
}

export async function getSaldosCuentas(
  filtroSedeCodigo?: string,
  rango?: { desde: string; hasta: string },
): Promise<SaldoCuenta[]> {
  const admin = createAdminClient()
  const sesion = await getSesion()
  const desde = rango?.desde ?? hoyBogota()
  const hasta = rango?.hasta ?? hoyBogota()

  const { data: sedesRaw } = await admin.from('sedes').select('id, codigo')
  const sedes = (sedesRaw ?? []) as Array<{ id: string; codigo: string }>
  const codigoPorId = new Map(sedes.map(s => [s.id, s.codigo]))

  const esAdmin = sesion.rol === 'admin'
  const sedeForzadaId = !esAdmin && sesion.sede_id ? sesion.sede_id : null
  const sid = sedeForzadaId ?? (filtroSedeCodigo ? sedes.find(s => s.codigo === filtroSedeCodigo)?.id ?? null : null)
  const sedeCodigoView = sid ? codigoPorId.get(sid) ?? undefined : undefined

  // Cuentas cuyo ACUMULADO puede ver el asesor: su efectivo + las permitidas de
  // su sede (SR: Nequi Luisa). El admin ve el total de todas.
  const permitidasTotal = new Set<string>(esAdmin ? [] : cuentasAcumuladoAsesor(sedeCodigoView))

  let qc = admin
    .from('cuentas')
    .select('id, nombre, tipo, sede_id, metodo_pago, saldo_inicial, fecha_corte')
    .eq('activa', true)
    .not('metodo_pago', 'is', null)
    .order('orden')

  if (sid) {
    // Vista de una sede. Solo cuentas de DINERO REAL (efectivo/nequi/bancolombia/
    // daviplata) que esa sede usa; se excluyen financieras (addi, sistecrédito),
    // datáfono (bold) y crédito, que se liquidan aparte.
    qc = qc
      .or(`sede_id.eq.${sid},sede_id.is.null`)
      .in('tipo', ['efectivo', 'nequi', 'bancolombia', 'daviplata'])
      .in('metodo_pago', metodosDeSede(sedeCodigoView))
  } else {
    // Vista consolidada (admin, todas las sedes): todas las cuentas de dinero real.
    qc = qc.neq('tipo', 'credito')
  }

  const cuentas = ((await qc).data ?? []) as Array<{ id: string; nombre: string; tipo: string; sede_id: string | null; metodo_pago: string | null; saldo_inicial: number; fecha_corte: string | null }>
  if (cuentas.length === 0) return []

  const ids = cuentas.map(c => c.id)
  const cortes = cuentas.map(c => c.fecha_corte).filter(Boolean) as string[]
  const corteMin = cortes.length ? cortes.sort()[0] : hoyBogota()

  const [pagosR, pfR, gastosR, pmR, trR] = await Promise.all([
    admin.from('pagos').select('cuenta_id, monto, fecha').in('cuenta_id', ids).neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(50000),
    admin.from('pagos_factura').select('cuenta_id, monto, fecha').in('cuenta_id', ids).neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(50000),
    admin.from('gastos').select('cuenta_id, valor, fecha').in('cuenta_id', ids).gte('fecha', corteMin).limit(50000),
    admin.from('pagos_mensajeria').select('cuenta_id, monto, fecha, tipo').in('cuenta_id', ids).eq('tipo', 'pago').gte('fecha', corteMin).limit(50000),
    admin.from('traslados_caja').select('origen_cuenta_id, destino_cuenta_id, monto, fecha').gte('fecha', corteMin).limit(50000),
  ])
  const pagos  = (pagosR.data  ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const pf     = (pfR.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const gastos = (gastosR.data ?? []) as Array<{ cuenta_id: string | null; valor: number; fecha: string }>
  const pm     = (pmR.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const tr     = (trR.data     ?? []) as Array<{ origen_cuenta_id: string | null; destino_cuenta_id: string; monto: number; fecha: string }>

  const enRango = (f: string) => f >= desde && f <= hasta

  return cuentas.map(c => {
    const corte = c.fecha_corte || hoyBogota()
    let ing = 0, eg = 0, hoy = 0
    for (const p of pagos)  if (p.cuenta_id === c.id && p.fecha >= corte) { ing += p.monto; if (enRango(p.fecha)) hoy += p.monto }
    for (const p of pf)     if (p.cuenta_id === c.id && p.fecha >= corte) { ing += p.monto; if (enRango(p.fecha)) hoy += p.monto }
    for (const p of pm)     if (p.cuenta_id === c.id && p.fecha >= corte) ing += p.monto
    for (const t of tr)     if (t.destino_cuenta_id === c.id && t.fecha >= corte) ing += t.monto
    for (const g of gastos) if (g.cuenta_id === c.id && g.fecha >= corte) eg += g.valor
    for (const t of tr)     if (t.origen_cuenta_id === c.id && t.fecha >= corte) eg += t.monto
    const es_efectivo = c.metodo_pago === 'efectivo'
    return {
      cuenta_id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      sede_codigo: c.sede_id ? codigoPorId.get(c.sede_id) ?? null : null,
      es_efectivo,
      hoy,
      total: c.saldo_inicial + ing - eg,
      verTotal: esAdmin || es_efectivo || permitidasTotal.has(c.metodo_pago ?? ''),
    }
  })
  // El filtrado (qué cuentas mostrar) se hace en la página: efectivo siempre,
  // más las que tuvieron movimiento hoy o cuyo total es visible y no es cero.
}

// Total de gastos ACUMULADO (todos los días), no solo el del rango. El asesor
// solo ve los de su sede; el admin todos (o los de la sede filtrada).
export async function getGastosAcumulado(filtroSedeCodigo?: string): Promise<number> {
  const admin = createAdminClient()
  const sesion = await getSesion()

  const { data: sedesRaw } = await admin.from('sedes').select('id, codigo')
  const sedes = (sedesRaw ?? []) as Array<{ id: string; codigo: string }>

  const esAdmin = sesion.rol === 'admin'
  const sedeForzadaId = !esAdmin && sesion.sede_id ? sesion.sede_id : null
  const sid = sedeForzadaId ?? (filtroSedeCodigo ? sedes.find(s => s.codigo === filtroSedeCodigo)?.id ?? null : null)

  let q = admin.from('gastos').select('valor').limit(100000)
  if (sid) q = q.eq('sede_id', sid)

  const rows = ((await q).data ?? []) as Array<{ valor: number }>
  return rows.reduce((s, g) => s + (g.valor ?? 0), 0)
}

export type CuadreFiltros = {
  desde: string
  hasta: string
  sede?: string
  asesor_id?: string
}

// ── Clasificación del dinero recaudado ───────────────────────────────────────
// caja       → efectivo / cuentas: dinero real que entra a la sede
// credito    → venta a crédito: NO es dinero, queda en cartera
// mensajeria → lo cobró el mensajero: por cobrar a la mensajería (no entra a caja)
export type TipoRecaudo = 'caja' | 'credito' | 'mensajeria'

export function tipoDeMetodo(m: MetodoPago): TipoRecaudo {
  if (m === 'credito') return 'credito'
  if (m === 'recaudo_mensajeria' || m === 'contra_entrega') return 'mensajeria'
  return 'caja'
}

export type CuadreIngreso = {
  id: string                  // id del pago (para confirmarlo)
  referencia: string          // número de pedido o de factura
  monto: number
  origen: string              // 'venta' | 'abono' | 'cartera'
  confirmado: boolean         // ✓ verificado que el dinero entró
}

export type CuadreMetodo = {
  metodo: MetodoPago
  label: string
  monto: number
  tipo: TipoRecaudo
  esperado: boolean   // está en la lista de métodos configurados de la sede
  detalle: CuadreIngreso[]   // cada ingreso (factura/pedido) que compone el total
}

export type CuadreSede = {
  sede_codigo: string
  sede_nombre: string
  vendido: number               // SUM(pedidos.total) — todo lo vendido en la sede
  recaudadoCaja: number         // dinero real que entró (efectivo + cuentas)
  porCobrarMensajeria: number   // lo que cobró el mensajero, por cobrar a la mensajería
  credito: number               // ventas a crédito recibidas (cartera, no caja)
  gastos: number                // egresos de la sede
  netoCaja: number              // recaudadoCaja − gastos
  porMetodo: CuadreMetodo[]     // desglose del recaudo por método (solo los de la sede)
}

export type FilaAsesor = {
  asesor_id: string
  asesor_nombre: string
  recaudadoCaja: number
}

// Detalle: cada factura emitida en el rango (no anuladas).
export type CuadreFactura = {
  numero_factura: string
  cliente_nombre: string
  sede_codigo: string
  total: number
  saldo: number
  estado: string
  metodos: string   // por dónde pagaron, ej: "Efectivo Santa Rosa, Addi"
}

// Detalle: cada pedido vendido (creado) en el rango que aún no tiene factura.
// Los pedidos ya facturados se muestran en la lista de facturas, para no
// contar lo mismo dos veces.
export type CuadrePedido = {
  numero_orden: string
  cliente_nombre: string
  sede_codigo: string
  total: number
  abonado: number
  estado: string
}

// Detalle: cada gasto del rango (para verlos en el cuadre, no solo el total).
export type CuadreGasto = {
  fecha: string
  categoria: string
  observacion: string | null
  sede_codigo: string
  valor: number
}

export type Cuadre = {
  filtros: CuadreFiltros
  sedes: CuadreSede[]
  porAsesor: FilaAsesor[]
  facturas: CuadreFactura[]
  pedidos: CuadrePedido[]
  gastosDetalle: CuadreGasto[]
  totalFacturado: number
  totalPedidos: number
  totalVendido: number
  totalRecaudadoCaja: number
  totalPorCobrarMensajeria: number
  totalCredito: number
  totalGastos: number
  totalNetoCaja: number
  registros: number
}

// Métodos de pago que se muestran en el cuadre de cada sede (checklist fijo,
// aparecen aunque estén en $0). Si una sede no está aquí, se muestran solo los
// métodos que tuvieron movimiento. Editable a medida que se confirmen las sedes.
const METODOS_POR_SEDE: Record<string, MetodoPago[]> = {
  SR: ['efectivo', 'addi', 'sistecredito', 'bold', 'nequi_luisa', 'credito'],
}

// ── Helpers de fecha (zona horaria Colombia = UTC−5, sin horario de verano) ──
// Las ventas se filtran por pedidos.fecha_creacion (timestamptz); las fechas del
// cuadre son días en hora Bogotá. 00:00 Bogotá = 05:00 UTC del mismo día.
function bogotaDayStartUTC(fecha: string): string {
  return `${fecha}T05:00:00.000Z`
}
function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function getCuadre(filtros: CuadreFiltros): Promise<Cuadre> {
  const supabase = await createClient()
  const sesion = await getSesion()

  // Sedes visibles + mapas codigo↔id↔nombre.
  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as Array<{ id: string; codigo: string; nombre: string }>
  const codigoPorId = new Map(sedes.map(s => [s.id, s.codigo]))
  const nombrePorCodigo = new Map(sedes.map(s => [s.codigo, s.nombre]))

  // ¿A qué sede está restringido el usuario? (asesor → su sede; admin → filtro opcional)
  const esAdmin = sesion.rol === 'admin'
  const sedeForzadaId = !esAdmin && sesion.sede_id ? sesion.sede_id : null
  const sedeForzadaCodigo = sedeForzadaId ? codigoPorId.get(sedeForzadaId) ?? null : null
  const sedeFiltroCodigo = esAdmin ? (filtros.sede || null) : sedeForzadaCodigo

  // ── Ventas (pedidos): todo lo vendido por sede en el rango ──────────────────
  // Trae también numero_orden/cliente/factura_id/abonado para listar cada pedido.
  let qVentas = supabase
    .from('vista_pedidos_asesor')
    .select('numero_orden, sede_codigo, total, estado, tipo, cliente_nombre, total_pagado, factura_id')
    .gte('fecha_creacion', bogotaDayStartUTC(filtros.desde))
    .lt('fecha_creacion', bogotaDayStartUTC(sumarDias(filtros.hasta, 1)))
    .neq('estado', 'cancelado')
    .limit(20000)
  if (sedeFiltroCodigo) qVentas = qVentas.eq('sede_codigo', sedeFiltroCodigo)

  // ── Facturas emitidas en el rango (no anuladas) ─────────────────────────────
  // Se filtra por creado_en (timestamptz) con ventana horaria Bogotá: fecha_factura
  // usa current_date (UTC) y dejaría fuera las facturas emitidas de noche.
  let qFacturas = supabase
    .from('vista_facturas')
    .select('id, numero_factura, cliente_nombre, sede_codigo, sede_id, total, saldo, estado')
    .gte('creado_en', bogotaDayStartUTC(filtros.desde))
    .lt('creado_en', bogotaDayStartUTC(sumarDias(filtros.hasta, 1)))
    .neq('estado', 'anulada')
    .limit(20000)
  if (sedeForzadaId) qFacturas = qFacturas.eq('sede_id', sedeForzadaId)
  else if (sedeFiltroCodigo) qFacturas = qFacturas.eq('sede_codigo', sedeFiltroCodigo)

  // ── Recaudo (pagos + pagos_factura) por sede y método ───────────────────────
  let qRecaudo = supabase
    .from('vista_pagos_unificados')
    .select('id, monto, metodo, sede_id, sede_codigo, asesor_id, asesor_nombre, referencia, origen, confirmado')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .limit(20000)
  if (sedeForzadaId) qRecaudo = qRecaudo.eq('sede_id', sedeForzadaId)
  else if (sedeFiltroCodigo) qRecaudo = qRecaudo.eq('sede_codigo', sedeFiltroCodigo)

  // ── Gastos del rango (visibles para todos; el asesor solo los de su sede) ───
  const idPorCodigo = new Map(sedes.map(s => [s.codigo, s.id]))
  const sedeFiltroId = sedeFiltroCodigo ? idPorCodigo.get(sedeFiltroCodigo) ?? null : null
  let qGastos = supabase
    .from('gastos')
    .select('valor, sede_id, categoria, observacion, fecha')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .order('fecha', { ascending: false })
    .limit(20000)
  const sedeGastosId = sedeForzadaId ?? sedeFiltroId
  if (sedeGastosId) qGastos = qGastos.eq('sede_id', sedeGastosId)

  const [ventasRes, recaudoRes, gastosRes, facturasRes] = await Promise.all([
    qVentas,
    qRecaudo,
    qGastos,
    qFacturas,
  ])

  if (ventasRes.error) throw new Error(`Error cargando ventas del cuadre: ${ventasRes.error.message}`)
  if (recaudoRes.error) throw new Error(`Error cargando recaudo del cuadre: ${recaudoRes.error.message}`)
  if (facturasRes.error) throw new Error(`Error cargando facturas del cuadre: ${facturasRes.error.message}`)

  const ventasRows  = (ventasRes.data ?? []) as Array<{ numero_orden: string; sede_codigo: string; total: number; estado: string; tipo: string; cliente_nombre: string; total_pagado: number; factura_id: string | null }>
  const recaudoRows = (recaudoRes.data ?? []) as Array<{ id: string; monto: number; metodo: MetodoPago; sede_codigo: string; asesor_id: string; asesor_nombre: string; referencia: string | null; origen: string; confirmado: boolean }>
  const gastosRows  = (gastosRes.data ?? []) as Array<{ valor: number; sede_id: string; categoria: string; observacion: string | null; fecha: string }>
  const facturasRows = (facturasRes.data ?? []) as Array<{ id: string; numero_factura: string; cliente_nombre: string; sede_codigo: string; total: number; saldo: number; estado: string }>

  // Métodos de pago de cada factura (por dónde pagaron), desde sus abonos no anulados.
  const factIds = facturasRows.map(f => f.id)
  const { data: pfMetodoRows } = factIds.length
    ? await supabase.from('pagos_factura').select('factura_id, metodo').in('factura_id', factIds).eq('anulado', false)
    : { data: [] as Array<{ factura_id: string; metodo: MetodoPago }> }
  const metodosPorFactura = new Map<string, Set<MetodoPago>>()
  for (const p of (pfMetodoRows ?? []) as Array<{ factura_id: string; metodo: MetodoPago }>) {
    let set = metodosPorFactura.get(p.factura_id)
    if (!set) { set = new Set(); metodosPorFactura.set(p.factura_id, set) }
    set.add(p.metodo)
  }

  // ── Determinar qué sedes mostrar ────────────────────────────────────────────
  let codigosVisibles: string[]
  if (sedeFiltroCodigo) codigosVisibles = [sedeFiltroCodigo]
  else codigosVisibles = sedes.map(s => s.codigo)

  // Acumuladores por sede.
  type Acc = {
    vendido: number
    gastos: number
    metodos: Map<MetodoPago, number>
    detalles: Map<MetodoPago, CuadreIngreso[]>
  }
  const accBySede = new Map<string, Acc>()
  const ensure = (codigo: string): Acc => {
    let a = accBySede.get(codigo)
    if (!a) { a = { vendido: 0, gastos: 0, metodos: new Map(), detalles: new Map() }; accBySede.set(codigo, a) }
    return a
  }
  codigosVisibles.forEach(ensure)

  for (const r of ventasRows) ensure(r.sede_codigo).vendido += r.total ?? 0

  for (const r of recaudoRows) {
    const a = ensure(r.sede_codigo)
    a.metodos.set(r.metodo, (a.metodos.get(r.metodo) ?? 0) + (r.monto ?? 0))
    let det = a.detalles.get(r.metodo)
    if (!det) { det = []; a.detalles.set(r.metodo, det) }
    det.push({ id: r.id, referencia: r.referencia ?? '—', monto: r.monto ?? 0, origen: r.origen, confirmado: r.confirmado })
  }

  const gastosDetalle: CuadreGasto[] = []
  for (const r of gastosRows) {
    const codigo = codigoPorId.get(r.sede_id)
    if (!codigo) continue
    ensure(codigo).gastos += r.valor ?? 0
    gastosDetalle.push({
      fecha: r.fecha,
      categoria: r.categoria,
      observacion: r.observacion,
      sede_codigo: codigo,
      valor: r.valor ?? 0,
    })
  }

  // ── Construir filas por sede ────────────────────────────────────────────────
  const sedesOut: CuadreSede[] = codigosVisibles.map(codigo => {
    const a = ensure(codigo)
    const esperados = METODOS_POR_SEDE[codigo] ?? null

    // Unir métodos esperados (checklist) + los que tuvieron movimiento.
    const metodosSet = new Set<MetodoPago>(esperados ?? [])
    for (const m of a.metodos.keys()) metodosSet.add(m)

    const porMetodo: CuadreMetodo[] = [...metodosSet].map(metodo => ({
      metodo,
      label: labelMetodo(metodo, codigo),
      monto: a.metodos.get(metodo) ?? 0,
      tipo: tipoDeMetodo(metodo),
      esperado: esperados ? esperados.includes(metodo) : true,
      detalle: (a.detalles.get(metodo) ?? []).sort((x, y) => y.monto - x.monto),
    })).sort((x, y) => y.monto - x.monto || x.label.localeCompare(y.label))

    let recaudadoCaja = 0, porCobrarMensajeria = 0, credito = 0
    for (const [metodo, monto] of a.metodos) {
      const t = tipoDeMetodo(metodo)
      if (t === 'caja') recaudadoCaja += monto
      else if (t === 'mensajeria') porCobrarMensajeria += monto
      else credito += monto
    }

    return {
      sede_codigo: codigo,
      sede_nombre: nombrePorCodigo.get(codigo) ?? codigo,
      vendido: a.vendido,
      recaudadoCaja,
      porCobrarMensajeria,
      credito,
      gastos: a.gastos,
      netoCaja: recaudadoCaja - a.gastos,
      porMetodo,
    }
  }).sort((x, y) => y.vendido - x.vendido)

  // ── Por asesor (recaudo en caja) ────────────────────────────────────────────
  const asesorMap = new Map<string, FilaAsesor>()
  for (const r of recaudoRows) {
    if (tipoDeMetodo(r.metodo) !== 'caja') continue
    let fa = asesorMap.get(r.asesor_id)
    if (!fa) { fa = { asesor_id: r.asesor_id, asesor_nombre: r.asesor_nombre, recaudadoCaja: 0 }; asesorMap.set(r.asesor_id, fa) }
    fa.recaudadoCaja += r.monto ?? 0
  }
  const porAsesor = [...asesorMap.values()].sort((a, b) => b.recaudadoCaja - a.recaudadoCaja)

  // ── Detalle: facturas emitidas ──────────────────────────────────────────────
  const facturas: CuadreFactura[] = facturasRows
    .map(f => {
      const ms = metodosPorFactura.get(f.id)
      const metodos = ms && ms.size
        ? [...ms].map(m => labelMetodo(m, f.sede_codigo)).join(', ')
        : '—'
      return {
        numero_factura: f.numero_factura,
        cliente_nombre: f.cliente_nombre,
        sede_codigo: f.sede_codigo,
        total: f.total ?? 0,
        saldo: f.saldo ?? 0,
        estado: f.estado,
        metodos,
      }
    })
    .sort((a, b) => a.sede_codigo.localeCompare(b.sede_codigo) || a.numero_factura.localeCompare(b.numero_factura))

  // ── Detalle: pedidos vendidos creados en el rango ───────────────────────────
  // Solo los que NO tienen factura: los facturados ya salen en la lista de
  // facturas (evita doble conteo). Incluye encargos y ventas directas en tienda.
  const pedidos: CuadrePedido[] = ventasRows
    .filter(p => !p.factura_id)
    .map(p => ({
      numero_orden: p.numero_orden,
      cliente_nombre: p.cliente_nombre,
      sede_codigo: p.sede_codigo,
      total: p.total ?? 0,
      abonado: p.total_pagado ?? 0,
      estado: p.estado,
    }))
    .sort((a, b) => a.sede_codigo.localeCompare(b.sede_codigo) || a.numero_orden.localeCompare(b.numero_orden))

  // ── Totales ─────────────────────────────────────────────────────────────────
  const totalVendido             = sedesOut.reduce((s, x) => s + x.vendido, 0)
  const totalRecaudadoCaja       = sedesOut.reduce((s, x) => s + x.recaudadoCaja, 0)
  const totalPorCobrarMensajeria = sedesOut.reduce((s, x) => s + x.porCobrarMensajeria, 0)
  const totalCredito             = sedesOut.reduce((s, x) => s + x.credito, 0)
  const totalGastos              = sedesOut.reduce((s, x) => s + x.gastos, 0)
  const totalFacturado           = facturas.reduce((s, x) => s + x.total, 0)
  const totalPedidos             = pedidos.reduce((s, x) => s + x.total, 0)

  return {
    filtros,
    sedes: sedesOut,
    porAsesor,
    facturas,
    pedidos,
    gastosDetalle,
    totalFacturado,
    totalPedidos,
    totalVendido,
    totalRecaudadoCaja,
    totalPorCobrarMensajeria,
    totalCredito,
    totalGastos,
    totalNetoCaja: totalRecaudadoCaja - totalGastos,
    registros: ventasRows.length + recaudoRows.length,
  }
}
