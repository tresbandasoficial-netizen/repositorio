import { createClient } from '@/lib/supabase/server'
import { MetricasAdmin, MetricasAsesor } from '@/types'

function hace(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

function hoyInicio(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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
      .gte('fecha_creacion', hoyInicio()),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hace(7)),
    supabase
      .from('pedidos')
      .select('total', { count: 'exact' })
      .gte('fecha_creacion', hace(30)),
    supabase
      .from('vista_pedidos_asesor')
      .select('en_alerta, es_zombie'),
    supabase
      .from('pagos')
      .select('monto')
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
