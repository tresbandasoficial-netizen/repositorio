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
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string | null
  numero_pedido: string | null
  notas: string | null
  estado: 'pendiente' | 'entregado'
  creado_en: string
}

// Lógica del cuadre:
// - Si el cliente paga en efectivo, la mensajería recoge valor_pedido → nos lo debe.
// - Si nosotros pagamos el domicilio (cobrar_al_cliente = false) → le debemos valor_domicilio.
// - Neto = lo que nos deben − lo que les debemos.
export function calcularCuadreDomicilio(d: {
  metodo_pago: 'efectivo' | 'transferencia'
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
}): { nos_deben: number; les_debemos: number; neto: number } {
  const nos_deben = d.metodo_pago === 'efectivo' ? d.valor_pedido : 0
  const les_debemos = d.cobrar_al_cliente ? 0 : d.valor_domicilio
  return { nos_deben, les_debemos, neto: nos_deben - les_debemos }
}

export type CuadreMensajeria = {
  mensajeria: 'exneider' | 'servigo'
  total_domicilios: number
  entregados: number
  pendientes: number
  nos_deben: number      // recaudo en efectivo que la mensajería nos debe
  les_debemos: number    // domicilios que nosotros pagamos a la mensajería
  neto: number           // nos_deben - les_debemos
}

export type CuadreDia = {
  fecha: string
  total_domicilios: number
  total_neto: number
  por_mensajeria: CuadreMensajeria[]
  por_asesor: { asesor_nombre: string; total: number; valor: number }[]
}

export async function getDomiciliosPorFecha(fecha: string): Promise<DomicilioRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('domicilios')
    .select(`
      id, fecha, asesor_id, cliente_nombre, cliente_telefono,
      direccion, mensajeria, valor_pedido, valor_domicilio, cobrar_al_cliente,
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

function resumirMensajerias(domicilios: Array<{
  mensajeria: 'exneider' | 'servigo'
  estado: string
  metodo_pago: 'efectivo' | 'transferencia'
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
}>): CuadreMensajeria[] {
  const mensajerias: ('exneider' | 'servigo')[] = ['exneider', 'servigo']
  return mensajerias.map((m) => {
    const grupo = domicilios.filter((d) => d.mensajeria === m)
    let nos_deben = 0
    let les_debemos = 0
    for (const d of grupo) {
      const c = calcularCuadreDomicilio(d)
      nos_deben += c.nos_deben
      les_debemos += c.les_debemos
    }
    return {
      mensajeria: m,
      total_domicilios: grupo.length,
      entregados: grupo.filter((d) => d.estado === 'entregado').length,
      pendientes: grupo.filter((d) => d.estado === 'pendiente').length,
      nos_deben,
      les_debemos,
      neto: nos_deben - les_debemos,
    }
  })
}

export async function getCuadreDia(fecha: string): Promise<CuadreDia> {
  const domicilios = await getDomiciliosPorFecha(fecha)

  const por_mensajeria = resumirMensajerias(domicilios)

  const asesorMap = new Map<string, { asesor_nombre: string; total: number; valor: number }>()
  for (const d of domicilios) {
    const entry = asesorMap.get(d.asesor_id) ?? { asesor_nombre: d.asesor_nombre, total: 0, valor: 0 }
    entry.total += 1
    entry.valor += calcularCuadreDomicilio(d).nos_deben
    asesorMap.set(d.asesor_id, entry)
  }

  return {
    fecha,
    total_domicilios: domicilios.length,
    total_neto: por_mensajeria.reduce((s, m) => s + m.neto, 0),
    por_mensajeria,
    por_asesor: Array.from(asesorMap.values()),
  }
}

export type CuadreSemanaDia = {
  fecha: string
  exneider_total: number
  exneider_neto: number
  servigo_total: number
  servigo_neto: number
}

export type CuadreSemana = {
  desde: string
  hasta: string
  total_domicilios: number
  total_neto: number
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
      id, fecha, asesor_id, mensajeria, valor_pedido, valor_domicilio,
      cobrar_al_cliente, metodo_pago, estado,
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

  const por_mensajeria = resumirMensajerias(domicilios)

  const diaMap = new Map<string, CuadreSemanaDia>()
  for (const d of domicilios) {
    const entry = diaMap.get(d.fecha) ?? {
      fecha: d.fecha,
      exneider_total: 0,
      exneider_neto: 0,
      servigo_total: 0,
      servigo_neto: 0,
    }
    const { neto } = calcularCuadreDomicilio(d)
    if (d.mensajeria === 'exneider') {
      entry.exneider_total += 1
      entry.exneider_neto += neto
    } else {
      entry.servigo_total += 1
      entry.servigo_neto += neto
    }
    diaMap.set(d.fecha, entry)
  }

  const asesorMap = new Map<string, { asesor_nombre: string; total: number; valor: number }>()
  for (const d of domicilios) {
    const entry = asesorMap.get(d.asesor_id) ?? { asesor_nombre: d.asesor_nombre, total: 0, valor: 0 }
    entry.total += 1
    entry.valor += calcularCuadreDomicilio(d).nos_deben
    asesorMap.set(d.asesor_id, entry)
  }

  return {
    desde,
    hasta,
    total_domicilios: domicilios.length,
    total_neto: por_mensajeria.reduce((s, m) => s + m.neto, 0),
    por_mensajeria,
    por_dia: Array.from(diaMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    por_asesor: Array.from(asesorMap.values()),
  }
}

export type CierreDia = {
  fecha: string
  cerrado_en: string
  cerrado_por_nombre: string
  total_neto: number
} | null

export async function getCierreDia(fecha: string): Promise<CierreDia> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cuadres_domicilios')
    .select('fecha, cerrado_en, total_neto, usuarios(nombre)')
    .eq('fecha', fecha)
    .maybeSingle()

  if (!data) return null
  return {
    fecha: data.fecha,
    cerrado_en: data.cerrado_en,
    cerrado_por_nombre: (data.usuarios as any)?.nombre ?? '',
    total_neto: data.total_neto,
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
