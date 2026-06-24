import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago, METODO_PAGO_LABELS } from '@/types'

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

export type CuadreMetodo = {
  metodo: MetodoPago
  label: string
  monto: number
  tipo: TipoRecaudo
  esperado: boolean   // está en la lista de métodos configurados de la sede
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

export type Cuadre = {
  filtros: CuadreFiltros
  sedes: CuadreSede[]
  porAsesor: FilaAsesor[]
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
  let qVentas = supabase
    .from('vista_pedidos_asesor')
    .select('sede_codigo, total, estado')
    .gte('fecha_creacion', bogotaDayStartUTC(filtros.desde))
    .lt('fecha_creacion', bogotaDayStartUTC(sumarDias(filtros.hasta, 1)))
    .neq('estado', 'cancelado')
    .limit(20000)
  if (sedeFiltroCodigo) qVentas = qVentas.eq('sede_codigo', sedeFiltroCodigo)

  // ── Recaudo (pagos + pagos_factura) por sede y método ───────────────────────
  let qRecaudo = supabase
    .from('vista_pagos_unificados')
    .select('monto, metodo, sede_id, sede_codigo, asesor_id, asesor_nombre')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .limit(20000)
  if (sedeForzadaId) qRecaudo = qRecaudo.eq('sede_id', sedeForzadaId)
  else if (sedeFiltroCodigo) qRecaudo = qRecaudo.eq('sede_codigo', sedeFiltroCodigo)

  // ── Gastos por sede (solo admin: el módulo de gastos es admin-only) ─────────
  const idPorCodigo = new Map(sedes.map(s => [s.codigo, s.id]))
  const sedeFiltroId = sedeFiltroCodigo ? idPorCodigo.get(sedeFiltroCodigo) ?? null : null
  let qGastos = esAdmin
    ? supabase
        .from('gastos')
        .select('valor, sede_id')
        .gte('fecha', filtros.desde)
        .lte('fecha', filtros.hasta)
        .limit(20000)
    : null
  if (qGastos && sedeFiltroId) qGastos = qGastos.eq('sede_id', sedeFiltroId)

  const [ventasRes, recaudoRes, gastosRes] = await Promise.all([
    qVentas,
    qRecaudo,
    qGastos ?? Promise.resolve({ data: [] as Array<{ valor: number; sede_id: string }> }),
  ])

  if (ventasRes.error) throw new Error(`Error cargando ventas del cuadre: ${ventasRes.error.message}`)
  if (recaudoRes.error) throw new Error(`Error cargando recaudo del cuadre: ${recaudoRes.error.message}`)

  const ventasRows  = (ventasRes.data ?? []) as Array<{ sede_codigo: string; total: number; estado: string }>
  const recaudoRows = (recaudoRes.data ?? []) as Array<{ monto: number; metodo: MetodoPago; sede_codigo: string; asesor_id: string; asesor_nombre: string }>
  const gastosRows  = (gastosRes.data ?? []) as Array<{ valor: number; sede_id: string }>

  // ── Determinar qué sedes mostrar ────────────────────────────────────────────
  let codigosVisibles: string[]
  if (sedeFiltroCodigo) codigosVisibles = [sedeFiltroCodigo]
  else codigosVisibles = sedes.map(s => s.codigo)

  // Acumuladores por sede.
  type Acc = {
    vendido: number
    gastos: number
    metodos: Map<MetodoPago, number>
  }
  const accBySede = new Map<string, Acc>()
  const ensure = (codigo: string): Acc => {
    let a = accBySede.get(codigo)
    if (!a) { a = { vendido: 0, gastos: 0, metodos: new Map() }; accBySede.set(codigo, a) }
    return a
  }
  codigosVisibles.forEach(ensure)

  for (const r of ventasRows) ensure(r.sede_codigo).vendido += r.total ?? 0

  for (const r of recaudoRows) {
    const a = ensure(r.sede_codigo)
    a.metodos.set(r.metodo, (a.metodos.get(r.metodo) ?? 0) + (r.monto ?? 0))
  }

  for (const r of gastosRows) {
    const codigo = codigoPorId.get(r.sede_id)
    if (!codigo) continue
    ensure(codigo).gastos += r.valor ?? 0
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
      label: METODO_PAGO_LABELS[metodo] ?? metodo,
      monto: a.metodos.get(metodo) ?? 0,
      tipo: tipoDeMetodo(metodo),
      esperado: esperados ? esperados.includes(metodo) : true,
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

  // ── Totales ─────────────────────────────────────────────────────────────────
  const totalVendido             = sedesOut.reduce((s, x) => s + x.vendido, 0)
  const totalRecaudadoCaja       = sedesOut.reduce((s, x) => s + x.recaudadoCaja, 0)
  const totalPorCobrarMensajeria = sedesOut.reduce((s, x) => s + x.porCobrarMensajeria, 0)
  const totalCredito             = sedesOut.reduce((s, x) => s + x.credito, 0)
  const totalGastos              = sedesOut.reduce((s, x) => s + x.gastos, 0)

  return {
    filtros,
    sedes: sedesOut,
    porAsesor,
    totalVendido,
    totalRecaudadoCaja,
    totalPorCobrarMensajeria,
    totalCredito,
    totalGastos,
    totalNetoCaja: totalRecaudadoCaja - totalGastos,
    registros: ventasRows.length + recaudoRows.length,
  }
}
