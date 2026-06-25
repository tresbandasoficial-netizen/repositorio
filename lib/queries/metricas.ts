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

export async function getMetricasAdmin(): Promise<MetricasAdmin> {
  const supabase = await createClient()

  const [
    pedidosHoy,
    pedidosSemana,
    pedidosMes,
    alertas,
    pagosMes,
    cartera,
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hoyInicio())
      .neq('estado', 'cancelado'),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hace(7))
      .neq('estado', 'cancelado'),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hace(30))
      .neq('estado', 'cancelado'),
    supabase
      .from('vista_pedidos_asesor')
      .select('en_alerta, es_zombie'),
    supabase
      .from('pagos')
      .select('monto')
      .eq('anulado', false)
      .gte('fecha', hace(30).slice(0, 10)),
    supabase
      .from('vista_cartera_clientes')
      .select('saldo'),
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

  const carteraRows = (cartera.data ?? []) as Array<{ saldo: number }>
  const carteraSaldo   = carteraRows.reduce((s, r) => s + (r.saldo ?? 0), 0)
  const carteraClientes = carteraRows.length

  return {
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
      .gte('fecha_creacion', hace(30)),
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
