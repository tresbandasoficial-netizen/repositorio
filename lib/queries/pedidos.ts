import { createClient } from '@/lib/supabase/server'
import { EstadoPedido } from '@/types'

export type PedidoRow = {
  id: string
  numero_orden: string
  estado: EstadoPedido
  total: number
  total_pagado: number
  // en_alerta y es_zombie vienen calculados desde SQL (fuente de verdad)
  en_alerta: boolean
  es_zombie: boolean
  tipo_entrega: 'domicilio' | 'sede'
  direccion_entrega: string | null
  notas: string | null
  numero_guia: string | null
  fecha_creacion: string
  fecha_actualizacion: string
  sede_codigo: string
  sede_nombre: string
  cliente_nombre: string
  cliente_telefono: string
  asesor_nombre: string
  asesor_id: string
  sede_id: string
  cliente_id: string
}

export type PedidoDetalle = PedidoRow & {
  items: Array<{
    id: string
    marca: string
    descripcion: string
    talla: string | null
    cantidad: number
    precio_venta: number
  }>
  pagos: Array<{
    id: string
    monto: number
    metodo: string
    fecha: string
    notas: string | null
    asesor_nombre: string
  }>
  historial: Array<{
    id: string
    campo: string
    valor_anterior: string | null
    valor_nuevo: string | null
    usuario_nombre: string
    fecha: string
  }>
}

const PAGE_SIZE = 25

export type PedidosResult = {
  pedidos: PedidoRow[]
  total: number
  pagina: number
  totalPaginas: number
}

export async function getPedidos(filtros?: {
  estado?: EstadoPedido
  sede?: string
  asesor_id?: string
  q?: string
  alerta?: boolean
  pagina?: number
}): Promise<PedidosResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, filtros?.pagina ?? 1)
  const desde = (pagina - 1) * PAGE_SIZE
  const hasta = desde + PAGE_SIZE - 1

  let query = supabase
    .from('vista_pedidos_asesor')
    .select('*', { count: 'exact' })
    .order('fecha_creacion', { ascending: false })
    .range(desde, hasta)

  if (filtros?.estado)    query = query.eq('estado', filtros.estado)
  if (filtros?.sede)      query = query.eq('sede_codigo', filtros.sede)
  if (filtros?.asesor_id) query = query.eq('asesor_id', filtros.asesor_id)
  if (filtros?.alerta)    query = query.eq('en_alerta', true)
  if (filtros?.q) {
    const q = filtros.q.trim()
    query = query.or(
      `numero_orden.ilike.%${q}%,cliente_nombre.ilike.%${q}%,cliente_telefono.ilike.%${q}%`
    )
  }

  const { data, error, count } = await query

  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)

  const total = count ?? 0
  return {
    pedidos:      (data ?? []) as PedidoRow[],
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getPedidoDetalle(id: string): Promise<PedidoDetalle | null> {
  const supabase = await createClient()

  const [pedidoRes, itemsRes, pagosRes, historialRes] = await Promise.all([
    supabase.from('vista_pedidos_asesor').select('*').eq('id', id).single(),
    supabase
      .from('pedido_items')
      .select('id, marca, descripcion, talla, cantidad, precio_venta')
      .eq('pedido_id', id)
      .order('id'),
    supabase
      .from('pagos')
      .select('id, monto, metodo, fecha, notas, usuarios(nombre)')
      .eq('pedido_id', id)
      .order('fecha', { ascending: true }),
    supabase
      .from('historial_cambios')
      .select('id, campo, valor_anterior, valor_nuevo, fecha, usuarios(nombre)')
      .eq('tabla', 'pedidos')
      .eq('registro_id', id)
      .order('fecha', { ascending: true }),
  ])

  if (pedidoRes.error || !pedidoRes.data) return null

  const pagos = (pagosRes.data ?? []).map((p: any) => ({
    id: p.id,
    monto: p.monto,
    metodo: p.metodo,
    fecha: p.fecha,
    notas: p.notas,
    asesor_nombre: p.usuarios?.nombre ?? '',
  }))

  const historial = (historialRes.data ?? []).map((h: any) => ({
    id: h.id,
    campo: h.campo,
    valor_anterior: h.valor_anterior,
    valor_nuevo: h.valor_nuevo,
    usuario_nombre: h.usuarios?.nombre ?? '',
    fecha: h.fecha,
  }))

  return {
    ...(pedidoRes.data as PedidoRow),
    items: itemsRes.data ?? [],
    pagos,
    historial,
  }
}

export async function getSiguienteNumeroOrden(sedeCodigo: string): Promise<string> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pedidos')
    .select('numero_orden')
    .ilike('numero_orden', `${sedeCodigo}%`)
    .order('numero_orden', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return `${sedeCodigo}0001`

  const ultimo = data[0].numero_orden
  const prefixLen = sedeCodigo.length
  const numPart = parseInt(ultimo.slice(prefixLen), 10)
  const siguiente = isNaN(numPart) ? 1 : numPart + 1

  return `${sedeCodigo}${siguiente}`
}
