import { createClient } from '@/lib/supabase/server'
import { EstadoPedido } from '@/types'

export type PedidoRow = {
  id: string
  numero_orden: string
  estado: EstadoPedido
  tipo: 'pedido' | 'venta_inmediata'
  total: number
  total_pagado: number
  // en_alerta y es_zombie vienen calculados desde SQL (fuente de verdad)
  primera_imagen: string | null
  en_alerta: boolean
  es_zombie: boolean
  tipo_entrega: 'domicilio' | 'sede'
  direccion_entrega: string | null
  notas: string | null
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
  factura_id: string | null
}

export type PedidoDetalle = PedidoRow & {
  cliente_cedula: string | null
  items: Array<{
    id: string
    marca: string
    descripcion: string
    talla: string | null
    cantidad: number
    precio_venta: number
    imagen_url: string | null
  }>
  pagos: Array<{
    id: string
    monto: number
    metodo: string
    fecha: string
    notas: string | null
    asesor_nombre: string
    origen?: 'pedido' | 'factura'   // 'factura' = abono hecho sobre la factura (venta local)
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
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<PedidosResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, filtros?.pagina ?? 1)
  const desde = (pagina - 1) * PAGE_SIZE
  const hasta = desde + PAGE_SIZE - 1

  let query = supabase
    .from('vista_pedidos_asesor')
    .select('*', { count: 'exact' })
    .neq('tipo', 'venta_inmediata')
    .order('fecha_creacion', { ascending: false })
    .range(desde, hasta)

  if (filtros?.estado)      query = query.eq('estado', filtros.estado)
  if (filtros?.sede)        query = query.eq('sede_codigo', filtros.sede)
  if (filtros?.asesor_id)   query = query.eq('asesor_id', filtros.asesor_id)
  if (filtros?.alerta) {
    const ts = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
    query = query.or(
      [
        `and(estado.eq.pendiente,fecha_actualizacion.lt.${ts(2)})`,
        `and(estado.eq.comprado,fecha_actualizacion.lt.${ts(8)})`,
        `and(estado.eq.usa,fecha_actualizacion.lt.${ts(6)})`,
        `and(estado.eq.bucaramanga,fecha_actualizacion.lt.${ts(1)})`,
        `and(estado.eq.santa_rosa,fecha_actualizacion.lt.${ts(1)})`,
        `and(estado.in.(pendiente,comprado,usa),fecha_creacion.lt.${ts(15)})`,
        `and(estado.eq.pendiente,fecha_creacion.lt.${ts(30)})`,
      ].join(',')
    )
  }
  if (filtros?.fecha_desde) query = query.gte('fecha_creacion', `${filtros.fecha_desde}T00:00:00`)
  if (filtros?.fecha_hasta) query = query.lte('fecha_creacion', `${filtros.fecha_hasta}T23:59:59`)
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
      .select('id, marca, descripcion, talla, cantidad, precio_venta, imagen_url')
      .eq('pedido_id', id)
      .order('id'),
    supabase
      .from('pagos')
      .select('id, monto, metodo, fecha, notas, usuarios(nombre)')
      .eq('pedido_id', id)
      .eq('anulado', false)
      .order('fecha', { ascending: true }),
    supabase
      .from('historial_cambios')
      .select('id, campo, valor_anterior, valor_nuevo, fecha, usuarios(nombre)')
      .eq('tabla', 'pedidos')
      .eq('registro_id', id)
      .order('fecha', { ascending: true }),
  ])

  if (pedidoRes.error || !pedidoRes.data) return null

  const pedidoData = pedidoRes.data as PedidoRow

  // Obtener cédula del cliente (no está en la vista)
  const { data: clienteData } = await supabase
    .from('clientes')
    .select('cedula')
    .eq('id', pedidoData.cliente_id)
    .single()

  // Si imagen_url no existe (migración pendiente), hacer fallback sin esa columna
  let itemsData: any[] = []
  if (itemsRes.error) {
    const fallback = await supabase
      .from('pedido_items')
      .select('id, marca, descripcion, talla, cantidad, precio_venta')
      .eq('pedido_id', id)
      .order('id')
    itemsData = (fallback.data ?? []).map(it => ({ ...it, imagen_url: null }))
  } else {
    itemsData = itemsRes.data ?? []
  }

  const pagos = (pagosRes.data ?? []).map((p: any) => ({
    id: p.id,
    monto: p.monto,
    metodo: p.metodo,
    fecha: p.fecha,
    notas: p.notas,
    asesor_nombre: p.usuarios?.nombre ?? '',
    origen: 'pedido' as 'pedido' | 'factura',
  }))

  // Si el pedido está facturado (incluye ventas locales VL), los abonos viven en
  // pagos_factura, no en pagos. Se traen para que el detalle muestre el pago real
  // y el saldo no aparezca pendiente cuando la factura ya está pagada.
  const facturaId = (pedidoData as { factura_id?: string | null }).factura_id ?? null
  let pagosFactura: typeof pagos = []
  if (facturaId) {
    const { data: pf } = await supabase
      .from('pagos_factura')
      .select('id, monto, metodo, fecha, notas, usuarios(nombre)')
      .eq('factura_id', facturaId)
      .eq('anulado', false)
      .order('fecha', { ascending: true })
    pagosFactura = (pf ?? []).map((p: any) => ({
      id: p.id,
      monto: p.monto,
      metodo: p.metodo,
      fecha: p.fecha,
      notas: p.notas,
      asesor_nombre: p.usuarios?.nombre ?? '',
      origen: 'factura' as 'pedido' | 'factura',
    }))
  }

  const pagosTodos = [...pagos, ...pagosFactura]
  // total pagado real = lo del pedido (vista) + abonos de la factura (sin crédito)
  const totalPagadoReal =
    (pedidoData.total_pagado ?? 0) +
    pagosFactura.reduce((s, p) => s + (p.metodo !== 'credito' ? p.monto : 0), 0)

  const historial = (historialRes.data ?? []).map((h: any) => ({
    id: h.id,
    campo: h.campo,
    valor_anterior: h.valor_anterior,
    valor_nuevo: h.valor_nuevo,
    usuario_nombre: h.usuarios?.nombre ?? '',
    fecha: h.fecha,
  }))

  return {
    ...pedidoData,
    total_pagado: totalPagadoReal,
    cliente_cedula: clienteData?.cedula ?? null,
    items: itemsData,
    pagos: pagosTodos,
    historial,
  }
}

export async function getSiguienteNumeroOrden(sedeCodigo: string): Promise<string> {
  const supabase = await createClient()

  // Consecutivo COMPARTIDO entre sedes: el siguiente número es el más alto usado
  // por cualquier sede + 1, así no se repiten números entre TR y SR (no quedan
  // TR0001 y SR0001 a la vez). Se mira solo el bloque reciente para que un número
  // viejo mal digitado (ej: TR59581) no dañe la sugerencia.
  const { data } = await supabase
    .from('pedidos')
    .select('numero_orden')
    .order('fecha_creacion', { ascending: false })
    .limit(300)

  let max = 0
  for (const p of (data ?? []) as Array<{ numero_orden: string }>) {
    // Prefijo de 2 letras (TR/CR/SR) + número. Otros formatos (VL-…) se ignoran.
    const m = /^[A-Za-z]{2}(\d+)$/.exec(p.numero_orden)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }

  return `${sedeCodigo}${max + 1}`
}
