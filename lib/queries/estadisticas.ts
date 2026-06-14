import { createClient } from '@/lib/supabase/server'

export type EstadisticaDia = {
  fecha: string          // YYYY-MM-DD (hora Colombia)
  pedidos: number
  ventas: number
  ticket_promedio: number
  por_sede: Record<string, number>  // TR/CR/SR → # pedidos
}

export type EstadisticaAsesor = {
  asesor_nombre: string
  pedidos: number
  ventas: number
  ticket_promedio: number
}

export type EstadisticaSede = {
  sede_codigo: string
  pedidos: number
  ventas: number
}

export type EstadisticaMetodoPago = {
  metodo: string
  count: number
  monto: number
  porcentaje_count: number
  porcentaje_monto: number
}

export type Estadisticas = {
  desde: string
  hasta: string
  total_pedidos: number
  total_ventas: number
  ticket_promedio: number
  promedio_diario: number
  mejor_dia: EstadisticaDia | null
  por_dia: EstadisticaDia[]
  por_asesor: EstadisticaAsesor[]
  por_sede: EstadisticaSede[]
  por_metodo_pago: EstadisticaMetodoPago[]
  total_recaudado: number   // suma de todos los pagos en el período
}

// Fecha YYYY-MM-DD en hora Colombia para un timestamp
function fechaBogota(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso))
}

export async function getEstadisticas(dias: number): Promise<Estadisticas> {
  const supabase = await createClient()

  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  const desdeISO = desde.toISOString()
  const desdeFecha = fechaBogota(desde)
  const hasta = fechaBogota(new Date())

  const [pedidosRes, pagosRes] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('fecha_creacion, total, sede_codigo, asesor_nombre, estado')
      .gte('fecha_creacion', desdeISO)
      .neq('estado', 'cancelado')
      .order('fecha_creacion', { ascending: true }),
    supabase
      .from('pagos')
      .select('metodo, monto, fecha')
      .gte('fecha', desdeFecha),
  ])

  const { data, error } = pedidosRes
  if (error) throw new Error(`Error cargando estadísticas: ${error.message}`)

  const pedidos = (data ?? []) as Array<{
    fecha_creacion: string
    total: number
    sede_codigo: string
    asesor_nombre: string
    estado: string
  }>

  // ── Por día ────────────────────────────────────────────────────────────────
  const diaMap = new Map<string, { pedidos: number; ventas: number; por_sede: Record<string, number> }>()
  for (const p of pedidos) {
    const f = fechaBogota(p.fecha_creacion)
    const entry = diaMap.get(f) ?? { pedidos: 0, ventas: 0, por_sede: {} }
    entry.pedidos += 1
    entry.ventas += p.total ?? 0
    entry.por_sede[p.sede_codigo] = (entry.por_sede[p.sede_codigo] ?? 0) + 1
    diaMap.set(f, entry)
  }

  const por_dia: EstadisticaDia[] = Array.from(diaMap.entries())
    .map(([fecha, e]) => ({
      fecha,
      pedidos: e.pedidos,
      ventas: e.ventas,
      ticket_promedio: e.pedidos > 0 ? Math.round(e.ventas / e.pedidos) : 0,
      por_sede: e.por_sede,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))  // más reciente primero

  // ── Por asesor ────────────────────────────────────────────────────────────
  const asesorMap = new Map<string, { pedidos: number; ventas: number }>()
  for (const p of pedidos) {
    const entry = asesorMap.get(p.asesor_nombre) ?? { pedidos: 0, ventas: 0 }
    entry.pedidos += 1
    entry.ventas += p.total ?? 0
    asesorMap.set(p.asesor_nombre, entry)
  }
  const por_asesor: EstadisticaAsesor[] = Array.from(asesorMap.entries())
    .map(([asesor_nombre, e]) => ({
      asesor_nombre,
      pedidos: e.pedidos,
      ventas: e.ventas,
      ticket_promedio: e.pedidos > 0 ? Math.round(e.ventas / e.pedidos) : 0,
    }))
    .sort((a, b) => b.ventas - a.ventas)

  // ── Por sede ──────────────────────────────────────────────────────────────
  const sedeMap = new Map<string, { pedidos: number; ventas: number }>()
  for (const p of pedidos) {
    const entry = sedeMap.get(p.sede_codigo) ?? { pedidos: 0, ventas: 0 }
    entry.pedidos += 1
    entry.ventas += p.total ?? 0
    sedeMap.set(p.sede_codigo, entry)
  }
  const por_sede: EstadisticaSede[] = Array.from(sedeMap.entries())
    .map(([sede_codigo, e]) => ({ sede_codigo, pedidos: e.pedidos, ventas: e.ventas }))
    .sort((a, b) => b.pedidos - a.pedidos)

  // ── Totales ───────────────────────────────────────────────────────────────
  const total_pedidos = pedidos.length
  const total_ventas = pedidos.reduce((s, p) => s + (p.total ?? 0), 0)
  const diasConPedidos = por_dia.length
  const mejor_dia = por_dia.length > 0
    ? [...por_dia].sort((a, b) => b.pedidos - a.pedidos)[0]
    : null

  // ── Por método de pago ────────────────────────────────────────────────────
  const pagos = (pagosRes.data ?? []) as Array<{ metodo: string; monto: number; fecha: string }>
  const METODOS = ['efectivo', 'transferencia', 'datafono', 'addi', 'bold', 'sistecredito', 'credito', 'otro']
  const metodoMap = new Map<string, { count: number; monto: number }>()
  let total_recaudado = 0
  for (const p of pagos) {
    const entry = metodoMap.get(p.metodo) ?? { count: 0, monto: 0 }
    entry.count += 1
    entry.monto += p.monto
    total_recaudado += p.monto
    metodoMap.set(p.metodo, entry)
  }
  const por_metodo_pago: EstadisticaMetodoPago[] = METODOS
    .filter(m => metodoMap.has(m))
    .map(m => {
      const e = metodoMap.get(m)!
      return {
        metodo: m,
        count: e.count,
        monto: e.monto,
        porcentaje_count: pagos.length > 0 ? Math.round((e.count / pagos.length) * 100) : 0,
        porcentaje_monto: total_recaudado > 0 ? Math.round((e.monto / total_recaudado) * 100) : 0,
      }
    })

  return {
    desde: desdeFecha,
    hasta,
    total_pedidos,
    total_ventas,
    ticket_promedio: total_pedidos > 0 ? Math.round(total_ventas / total_pedidos) : 0,
    promedio_diario: diasConPedidos > 0 ? Math.round((total_pedidos / diasConPedidos) * 10) / 10 : 0,
    mejor_dia,
    por_dia,
    por_asesor,
    por_sede,
    por_metodo_pago,
    total_recaudado,
  }
}
