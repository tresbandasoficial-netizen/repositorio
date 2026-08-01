import { createClient } from '@/lib/supabase/server'
import { MetricasAdmin, MetricasAsesor, MetricasSede } from '@/types'
import type { PedidoRow } from '@/lib/queries/pedidos'
import { hoyBogota } from '@/lib/utils/format'

function hace(dias: number): string {
  const hoy = hoyBogota()
  const d = new Date(hoy + 'T05:00:00.000Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString()
}

function hoyInicio(): string {
  const hoy = hoyBogota()
  return hoy + 'T05:00:00.000Z'
}

// Inicio del mes calendario actual (día 1) en hora Bogotá. "Del mes" = este mes,
// no los últimos 30 días: el 1° del mes las métricas arrancan de cero.
function inicioMes(): string {
  return hoyBogota().slice(0, 8) + '01T05:00:00.000Z'  // 'YYYY-MM-01T05:00…'
}
function inicioMesFecha(): string {
  return hoyBogota().slice(0, 8) + '01'                // 'YYYY-MM-01'
}

export async function getMetricasAdmin(): Promise<MetricasAdmin> {
  const supabase = await createClient()

  const [
    pedidosHoy,
    pedidosSemana,
    pedidosMes,
    alertas,
    pagosMes,
    cartera,
    facturasMes,
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hoyInicio())
      .neq('estado', 'cancelado')
      .neq('tipo', 'saldo_anterior'),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hace(7))
      .neq('estado', 'cancelado')
      .neq('tipo', 'saldo_anterior'),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', inicioMes())
      .neq('estado', 'cancelado')
      .neq('tipo', 'saldo_anterior'),
    supabase
      .from('vista_pedidos_asesor')
      .select('en_alerta, es_zombie'),
    supabase
      .from('pagos')
      .select('monto')
      .eq('anulado', false)
      .neq('metodo', 'credito')
      .gte('fecha', inicioMesFecha()),
    supabase
      .from('vista_cartera_clientes')
      .select('saldo, saldo_entregado, saldo_proceso'),
    // Facturación del mes: el saldo (no el estado) decide contado vs crédito,
    // así una factura con estado desactualizado no se clasifica mal.
    supabase
      .from('vista_facturas')
      .select('total, saldo')
      .gte('fecha_factura', inicioMesFecha())
      .neq('estado', 'anulada'),
  ])

  const sumarTotal = (rows: Array<{ total: number }> | null) =>
    (rows ?? []).reduce((s, r) => s + (r.total ?? 0), 0)

  const ventasHoy   = sumarTotal(pedidosHoy.data ?? [])
  const ventasSemana = sumarTotal(pedidosSemana.data ?? [])
  const ventasMes   = sumarTotal(pedidosMes.data ?? [])

  const countMes    = pedidosMes.count ?? 0
  const ticketPromedio = countMes > 0 ? Math.round(ventasMes / countMes) : 0

  const abonosMes = (pagosMes.data ?? []).reduce((s, p) => s + (p.monto ?? 0), 0)

  const allAlerts = alertas.data ?? []
  const pedidosEnAlerta = allAlerts.filter((r) => r.en_alerta).length
  const pedidosZombie   = allAlerts.filter((r) => r.es_zombie).length

  const carteraRows = (cartera.data ?? []) as Array<{ saldo: number; saldo_entregado: number; saldo_proceso: number }>
  const carteraSaldo   = carteraRows.reduce((s, r) => s + (r.saldo ?? 0), 0)
  const carteraClientes = carteraRows.length
  // La cartera partida en dos: lo que deben de mercancía YA entregada/facturada
  // (crédito real) y lo que falta por pagar de pedidos que aún no se entregan.
  const carteraEntregado = carteraRows.reduce((s, r) => s + (r.saldo_entregado ?? 0), 0)
  const carteraEntregadoClientes = carteraRows.filter(r => (r.saldo_entregado ?? 0) > 0).length
  const carteraPedidos = carteraRows.reduce((s, r) => s + (r.saldo_proceso ?? 0), 0)
  const carteraPedidosClientes = carteraRows.filter(r => (r.saldo_proceso ?? 0) > 0).length

  const facturas = (facturasMes.data ?? []) as Array<{ total: number; saldo: number }>
  const contado = facturas.filter(f => (f.saldo ?? 0) <= 0)
  const credito = facturas.filter(f => (f.saldo ?? 0) > 0)

  return {
    facturado_mes:     facturas.reduce((s, f) => s + (f.total ?? 0), 0),
    facturas_mes:      facturas.length,
    facturado_contado: contado.reduce((s, f) => s + (f.total ?? 0), 0),
    facturas_contado:  contado.length,
    facturado_credito: credito.reduce((s, f) => s + (f.total ?? 0), 0),
    facturas_credito:  credito.length,
    credito_saldo:     credito.reduce((s, f) => s + (f.saldo ?? 0), 0),
    pedidos_hoy:      pedidosHoy.count  ?? 0,
    pedidos_semana:   pedidosSemana.count ?? 0,
    pedidos_mes:      countMes,
    ventas_hoy:       ventasHoy,
    ventas_semana:    ventasSemana,
    ventas_mes:       ventasMes,
    pedidos_en_alerta: pedidosEnAlerta,
    pedidos_zombie:   pedidosZombie,
    ticket_promedio:  ticketPromedio,
    abonos_mes:       abonosMes,
    cartera_clientes: carteraClientes,
    cartera_saldo:    carteraSaldo,
    cartera_entregado:          carteraEntregado,
    cartera_entregado_clientes: carteraEntregadoClientes,
    cartera_pedidos:            carteraPedidos,
    cartera_pedidos_clientes:   carteraPedidosClientes,
  }
}

export async function getMetricasAsesor(asesorId: string): Promise<MetricasAsesor> {
  const supabase = await createClient()

  const [activos, pedidosMes] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('en_alerta')
      .eq('asesor_id', asesorId)
      .not('estado', 'in', '("entregado","cancelado")'),
    supabase
      .from('vista_pedidos_asesor')
      .select('total')
      .eq('asesor_id', asesorId)
      .gte('fecha_creacion', inicioMes()),
  ])

  const activosData = activos.data ?? []
  const enAlerta    = activosData.filter((r) => r.en_alerta).length
  const ventasMes   = (pedidosMes.data ?? []).reduce((s, r) => s + (r.total ?? 0), 0)
  const countMes    = pedidosMes.data?.length ?? 0

  return {
    pedidos_activos:   activosData.length,
    pedidos_en_alerta: enAlerta,
    ventas_mes:        ventasMes,
    ticket_promedio:   countMes > 0 ? Math.round(ventasMes / countMes) : 0,
  }
}

// Por sede: facturación del mes partida en contado/crédito + pedidos que
// faltan por llegar (estado antes de tocar sede: pendiente/comprado/USA).
export type ResumenSedeMes = {
  contado_mes: number
  credito_mes: number
  por_llegar_pedidos: number
  por_llegar_valor: number
}

export async function getResumenSedesMes(): Promise<Record<string, ResumenSedeMes>> {
  const supabase = await createClient()
  const [facturas, porLlegar] = await Promise.all([
    supabase
      .from('vista_facturas')
      .select('sede_codigo, total, saldo')
      .gte('fecha_factura', inicioMesFecha())
      .neq('estado', 'anulada'),
    supabase
      .from('pedidos')
      .select('total, sedes(codigo)')
      .in('estado', ['pendiente', 'comprado', 'usa'])
      .not('tipo', 'in', '("venta_inmediata","saldo_anterior")'),
  ])

  const r: Record<string, ResumenSedeMes> = {}
  const de = (codigo: string) =>
    (r[codigo] ??= { contado_mes: 0, credito_mes: 0, por_llegar_pedidos: 0, por_llegar_valor: 0 })

  for (const f of (facturas.data ?? []) as Array<{ sede_codigo: string; total: number; saldo: number }>) {
    const s = de(f.sede_codigo)
    if ((f.saldo ?? 0) > 0) s.credito_mes += f.total ?? 0
    else s.contado_mes += f.total ?? 0
  }
  for (const p of (porLlegar.data ?? []) as unknown as Array<{ total: number; sedes: { codigo: string } | { codigo: string }[] | null }>) {
    const sede = Array.isArray(p.sedes) ? p.sedes[0] : p.sedes
    if (!sede) continue
    const s = de(sede.codigo)
    s.por_llegar_pedidos += 1
    s.por_llegar_valor += p.total ?? 0
  }
  return r
}

export type DeudaSede = { sede_id: string; codigo: string; nombre: string; saldo: number }

// Lo que deben los clientes, por sede (solo admin lo consume).
export async function getDeudaPorSede(): Promise<DeudaSede[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('deuda_por_sede').select('*')
  return (data ?? []) as DeudaSede[]
}

export type MesVenta = { clave: string; label: string; total: number; pedidos: number }

// Ventas del asesor agrupadas por mes (últimos N meses, hora Bogotá).
export async function getVentasMensualesAsesor(asesorId: string, meses = 8): Promise<MesVenta[]> {
  const supabase = await createClient()

  const hoy = hoyBogota()                         // 'YYYY-MM-DD'
  const y = parseInt(hoy.slice(0, 4), 10)
  const mo = parseInt(hoy.slice(5, 7), 10)
  // 1° del primer mes de la ventana (en UTC-5 ≈ Bogotá).
  const desdeISO = new Date(Date.UTC(y, mo - meses, 1, 5)).toISOString()

  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('fecha_creacion, total')
    .eq('asesor_id', asesorId)
    .neq('estado', 'cancelado')
    .neq('tipo', 'saldo_anterior')
    .gte('fecha_creacion', desdeISO)
    .limit(20000)

  const fmtClave = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' })
  const fmtLabel = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', month: 'short', year: '2-digit' })

  // Prellenar los N meses (para que salgan también los meses en $0).
  const mapa = new Map<string, MesVenta>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 15, 12))
    const clave = fmtClave.format(d).slice(0, 7)
    mapa.set(clave, { clave, label: fmtLabel.format(d).replace('.', ''), total: 0, pedidos: 0 })
  }

  for (const p of (data ?? []) as Array<{ fecha_creacion: string; total: number }>) {
    const clave = fmtClave.format(new Date(p.fecha_creacion)).slice(0, 7)
    const m = mapa.get(clave)
    if (m) { m.total += p.total ?? 0; m.pedidos += 1 }
  }

  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}

export async function getMetricasPorSede(): Promise<MetricasSede[]> {
  const supabase = await createClient()

  const [activos, mensuales] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('sede_codigo, sede_nombre, en_alerta')
      .not('estado', 'in', '("entregado","cancelado")'),
    supabase
      .from('vista_pedidos_asesor')
      .select('sede_codigo, total')
      .gte('fecha_creacion', hace(30))
      .neq('estado', 'cancelado'),
  ])

  const SEDES = ['TR', 'CR', 'SR']
  const nombreBySede: Record<string, string> = {}
  const activosBySede: Record<string, { count: number; alertas: number }> = {}
  const ventasBySede: Record<string, number> = {}

  for (const r of (activos.data ?? []) as Array<{ sede_codigo: string; sede_nombre: string; en_alerta: boolean }>) {
    nombreBySede[r.sede_codigo] = r.sede_nombre
    if (!activosBySede[r.sede_codigo]) activosBySede[r.sede_codigo] = { count: 0, alertas: 0 }
    activosBySede[r.sede_codigo].count++
    if (r.en_alerta) activosBySede[r.sede_codigo].alertas++
  }

  for (const r of (mensuales.data ?? []) as Array<{ sede_codigo: string; total: number }>) {
    ventasBySede[r.sede_codigo] = (ventasBySede[r.sede_codigo] ?? 0) + r.total
  }

  return SEDES.map((codigo) => ({
    sede_codigo:       codigo,
    sede_nombre:       nombreBySede[codigo] ?? codigo,
    pedidos_activos:   activosBySede[codigo]?.count ?? 0,
    pedidos_en_alerta: activosBySede[codigo]?.alertas ?? 0,
    ventas_mes:        ventasBySede[codigo] ?? 0,
  }))
}

export type MetricasAsesorRow = {
  asesor_id: string
  asesor_nombre: string
  pedidos_mes: number
  ventas_mes: number
  ticket_promedio: number
  pedidos_activos: number
}

export async function getMetricasPorAsesor(): Promise<MetricasAsesorRow[]> {
  const supabase = await createClient()

  const [activos, mensuales] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('asesor_id, asesor_nombre')
      .not('estado', 'in', '("entregado","cancelado")'),
    supabase
      .from('vista_pedidos_asesor')
      .select('asesor_id, asesor_nombre, total')
      .gte('fecha_creacion', hace(30))
      .neq('estado', 'cancelado'),
  ])

  const nombreById: Record<string, string> = {}
  const activosByAsesor: Record<string, number> = {}
  const ventasByAsesor: Record<string, number> = {}
  const countByAsesor: Record<string, number> = {}

  for (const r of (activos.data ?? []) as Array<{ asesor_id: string; asesor_nombre: string }>) {
    nombreById[r.asesor_id] = r.asesor_nombre
    activosByAsesor[r.asesor_id] = (activosByAsesor[r.asesor_id] ?? 0) + 1
  }

  for (const r of (mensuales.data ?? []) as Array<{ asesor_id: string; asesor_nombre: string; total: number }>) {
    nombreById[r.asesor_id] = r.asesor_nombre
    ventasByAsesor[r.asesor_id] = (ventasByAsesor[r.asesor_id] ?? 0) + r.total
    countByAsesor[r.asesor_id] = (countByAsesor[r.asesor_id] ?? 0) + 1
  }

  const ids = [...new Set([...Object.keys(activosByAsesor), ...Object.keys(ventasByAsesor)])]

  return ids
    .map((id) => {
      const ventas = ventasByAsesor[id] ?? 0
      const count  = countByAsesor[id] ?? 0
      return {
        asesor_id:       id,
        asesor_nombre:   nombreById[id] ?? id,
        pedidos_mes:     count,
        ventas_mes:      ventas,
        ticket_promedio: count > 0 ? Math.round(ventas / count) : 0,
        pedidos_activos: activosByAsesor[id] ?? 0,
      }
    })
    .sort((a, b) => b.ventas_mes - a.ventas_mes)
}


export async function getUltimosPedidosAsesor(asesorId: string): Promise<PedidoRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('*')
    .eq('asesor_id', asesorId)
    .not('estado', 'in', '("entregado","cancelado")')
    .order('fecha_actualizacion', { ascending: false })
    .limit(6)
  return (data ?? []) as PedidoRow[]
}
