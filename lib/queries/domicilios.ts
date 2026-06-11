import { createClient } from '@/lib/supabase/server'

export type DomicilioRow = {
  id: string
  fecha: string
  asesor_id: string
  asesor_nombre: string
  cliente_nombre: string
  cliente_telefono: string | null
  direccion: string
  mensajeria: 'exneider' | 'servigo'
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string | null
  numero_pedido: string | null
  notas: string | null
  estado: 'pendiente' | 'entregado'
  creado_en: string
}

export type CuadreMensajeria = {
  mensajeria: 'exneider' | 'servigo'
  total_domicilios: number
  total_valor: number
  entregados: number
  pendientes: number
}

export type CuadreDia = {
  fecha: string
  total_domicilios: number
  total_valor: number
  por_mensajeria: CuadreMensajeria[]
  por_asesor: { asesor_nombre: string; total: number; valor: number }[]
}

export async function getDomiciliosPorFecha(fecha: string): Promise<DomicilioRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('domicilios')
    .select(`
      id, fecha, asesor_id, cliente_nombre, cliente_telefono,
      direccion, mensajeria, valor_domicilio, cobrar_al_cliente,
      metodo_pago, articulo, numero_pedido, notas, estado, creado_en,
      usuarios(nombre)
    `)
    .eq('fecha', fecha)
    .order('creado_en', { ascending: true })

  if (error) throw new Error(`Error cargando domicilios: ${error.message}`)

  return (data ?? []).map((d: any) => ({
    ...d,
    asesor_nombre: d.usuarios?.nombre ?? '',
  }))
}

export async function getCuadreDia(fecha: string): Promise<CuadreDia> {
  const domicilios = await getDomiciliosPorFecha(fecha)

  const total_domicilios = domicilios.length
  const total_valor = domicilios.reduce((s, d) => s + d.valor_domicilio, 0)

  const mensajerias: ('exneider' | 'servigo')[] = ['exneider', 'servigo']
  const por_mensajeria: CuadreMensajeria[] = mensajerias.map((m) => {
    const grupo = domicilios.filter((d) => d.mensajeria === m)
    return {
      mensajeria: m,
      total_domicilios: grupo.length,
      total_valor: grupo.reduce((s, d) => s + d.valor_domicilio, 0),
      entregados: grupo.filter((d) => d.estado === 'entregado').length,
      pendientes: grupo.filter((d) => d.estado === 'pendiente').length,
    }
  })

  const asesorMap = new Map<string, { asesor_nombre: string; total: number; valor: number }>()
  for (const d of domicilios) {
    const entry = asesorMap.get(d.asesor_id) ?? { asesor_nombre: d.asesor_nombre, total: 0, valor: 0 }
    entry.total += 1
    entry.valor += d.valor_domicilio
    asesorMap.set(d.asesor_id, entry)
  }

  return {
    fecha,
    total_domicilios,
    total_valor,
    por_mensajeria,
    por_asesor: Array.from(asesorMap.values()),
  }
}

export type CuadreSemanaDia = {
  fecha: string
  exneider_total: number
  exneider_valor: number
  servigo_total: number
  servigo_valor: number
}

export type CuadreSemana = {
  desde: string
  hasta: string
  total_domicilios: number
  total_valor: number
  por_mensajeria: CuadreMensajeria[]
  por_dia: CuadreSemanaDia[]
  por_asesor: { asesor_nombre: string; total: number; valor: number }[]
}

// Semana lunes-domingo que contiene la fecha dada
export function rangoSemana(fecha: string): { desde: string; hasta: string } {
  const d = new Date(fecha + 'T00:00:00Z')
  const dia = d.getUTCDay() // 0 = domingo
  const offset = dia === 0 ? 6 : dia - 1
  const lunes = new Date(d)
  lunes.setUTCDate(d.getUTCDate() - offset)
  const domingo = new Date(lunes)
  domingo.setUTCDate(lunes.getUTCDate() + 6)
  return {
    desde: lunes.toISOString().slice(0, 10),
    hasta: domingo.toISOString().slice(0, 10),
  }
}

export async function getCuadreSemana(fecha: string): Promise<CuadreSemana> {
  const { desde, hasta } = rangoSemana(fecha)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('domicilios')
    .select(`
      id, fecha, asesor_id, mensajeria, valor_domicilio, estado,
      usuarios(nombre)
    `)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })

  if (error) throw new Error(`Error cargando cuadre semanal: ${error.message}`)

  const domicilios = (data ?? []).map((d: any) => ({
    ...d,
    asesor_nombre: d.usuarios?.nombre ?? '',
  }))

  const mensajerias: ('exneider' | 'servigo')[] = ['exneider', 'servigo']
  const por_mensajeria: CuadreMensajeria[] = mensajerias.map((m) => {
    const grupo = domicilios.filter((d) => d.mensajeria === m)
    return {
      mensajeria: m,
      total_domicilios: grupo.length,
      total_valor: grupo.reduce((s, d) => s + d.valor_domicilio, 0),
      entregados: grupo.filter((d) => d.estado === 'entregado').length,
      pendientes: grupo.filter((d) => d.estado === 'pendiente').length,
    }
  })

  const diaMap = new Map<string, CuadreSemanaDia>()
  for (const d of domicilios) {
    const entry = diaMap.get(d.fecha) ?? {
      fecha: d.fecha,
      exneider_total: 0,
      exneider_valor: 0,
      servigo_total: 0,
      servigo_valor: 0,
    }
    if (d.mensajeria === 'exneider') {
      entry.exneider_total += 1
      entry.exneider_valor += d.valor_domicilio
    } else {
      entry.servigo_total += 1
      entry.servigo_valor += d.valor_domicilio
    }
    diaMap.set(d.fecha, entry)
  }

  const asesorMap = new Map<string, { asesor_nombre: string; total: number; valor: number }>()
  for (const d of domicilios) {
    const entry = asesorMap.get(d.asesor_id) ?? { asesor_nombre: d.asesor_nombre, total: 0, valor: 0 }
    entry.total += 1
    entry.valor += d.valor_domicilio
    asesorMap.set(d.asesor_id, entry)
  }

  return {
    desde,
    hasta,
    total_domicilios: domicilios.length,
    total_valor: domicilios.reduce((s, d) => s + d.valor_domicilio, 0),
    por_mensajeria,
    por_dia: Array.from(diaMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    por_asesor: Array.from(asesorMap.values()),
  }
}

export async function getFechasConDomicilios(limite = 30): Promise<string[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('domicilios')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(500)

  const fechas = [...new Set((data ?? []).map((d: any) => d.fecha as string))]
  return fechas.slice(0, limite)
}
