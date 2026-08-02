import { createClient } from '@/lib/supabase/server'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'
import { ClienteSegmentoRfm, EstadoPedido } from '@/types'

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
  // Segmento RFM del cliente (Campeón, Leal, …), para priorizar a simple vista.
  // Viene de vista_rfm_clientes, no de vista_pedidos_asesor.
  cliente_segmento?: ClienteSegmentoRfm | null
}

export type PedidoDetalle = PedidoRow & {
  cliente_cedula: string | null
  items: Array<{
    id: string
    codigo: string | null
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
  marca?: string
  sinCompra?: boolean
  alerta?: boolean
  pagina?: number
  fecha_desde?: string
  fecha_hasta?: string
  porPagina?: number   // la galería usa 30 (cuadrícula de 6×5)
}): Promise<PedidosResult> {
  const supabase = await createClient()
  const porPagina = filtros?.porPagina ?? PAGE_SIZE
  const pagina = Math.max(1, filtros?.pagina ?? 1)
  const desde = (pagina - 1) * porPagina
  const hasta = desde + porPagina - 1

  // Orden: por defecto los más recientes primero. Cuando se filtra por un
  // estado de sede (bucaramanga / santa_rosa), se ordena POR LLEGADA a la
  // sede, del más nuevo al más viejo (fecha_estado = cuándo pasó a ese
  // estado, según historial). Los sin registro en el historial van de últimos.
  const porLlegada = filtros?.estado === 'bucaramanga' || filtros?.estado === 'santa_rosa'

  let query = supabase
    .from('vista_pedidos_asesor')
    .select('*', { count: 'exact' })
    .not('tipo', 'in', '("venta_inmediata","saldo_anterior")')
    .range(desde, hasta)

  query = porLlegada
    ? query.order('fecha_estado', { ascending: false, nullsFirst: false })
    : query.order('fecha_creacion', { ascending: false })

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
  // "Falta comprar": pedidos SIN ninguna compra registrada, sin importar en qué
  // estado estén. El estado se avanza a mano, así que hay pedidos marcados
  // "comprado" o "en USA" a los que nunca se les registró la compra — filtrar
  // por estado 'pendiente' no los encuentra. Se excluyen los cancelados y los ya
  // entregados: esos no hay que pedirlos.
  if (filtros?.sinCompra) {
    // La vista expone `tiene_compra` (exists sobre compra_items): filtrar en el
    // servidor evita armar un `id not in (...)` gigante que revienta la URL.
    query = query.not('estado', 'in', '(cancelado,entregado)').eq('tiene_compra', false)
  }

  // Filtro por MARCA: la vista expone `marcas` (array en minúsculas con la
  // marca del item o del catálogo enlazado — migración 148), así el filtro va
  // directo en la consulta. Antes se armaba una lista de ids con tope de 300
  // (límite de URL) y los pedidos que quedaban por fuera desaparecían.
  if (filtros?.marca?.trim()) {
    const m = terminoBusquedaSeguro(filtros.marca)?.toLowerCase()
    if (m) query = query.contains('marcas', [m])
  }

  if (filtros?.q) {
    const q = terminoBusquedaSeguro(filtros.q)
    if (q) {
      // También se puede buscar por CÓDIGO o MARCA del artículo: se buscan los
      // pedidos cuyos items coincidan (propios o del catálogo enlazado).
      const [porCodigoItem, porCodigoCatalogo, porMarcaItem, porMarcaCatalogo] = await Promise.all([
        supabase.from('pedido_items').select('pedido_id').ilike('codigo', `%${q}%`).limit(150),
        supabase.from('pedido_items').select('pedido_id, articulos!inner(id)').ilike('articulos.codigo', `%${q}%`).limit(150),
        supabase.from('pedido_items').select('pedido_id').ilike('marca', `%${q}%`).limit(150),
        supabase.from('pedido_items').select('pedido_id, articulos!inner(id)').ilike('articulos.marca', `%${q}%`).limit(150),
      ])
      const idsPorItem = [...new Set([
        ...((porCodigoItem.data ?? []) as Array<{ pedido_id: string }>).map(r => r.pedido_id),
        ...((porCodigoCatalogo.data ?? []) as Array<{ pedido_id: string }>).map(r => r.pedido_id),
        ...((porMarcaItem.data ?? []) as Array<{ pedido_id: string }>).map(r => r.pedido_id),
        ...((porMarcaCatalogo.data ?? []) as Array<{ pedido_id: string }>).map(r => r.pedido_id),
      ])].slice(0, 300)

      const condiciones = [
        `numero_orden.ilike.%${q}%`,
        `cliente_nombre.ilike.%${q}%`,
        `cliente_telefono.ilike.%${q}%`,
        ...(idsPorItem.length > 0 ? [`id.in.(${idsPorItem.join(',')})`] : []),
      ]
      query = query.or(condiciones.join(','))
    }
  }

  const { data, error, count } = await query

  // PGRST103: la página pedida quedó más allá del total (p.ej. estaba en la
  // página 5 y aplicó un filtro con menos resultados) — volver a la página 1.
  if (error?.message.includes('Requested range not satisfiable') && pagina > 1) {
    return getPedidos({ ...filtros, pagina: 1 })
  }
  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)

  const pedidos = (data ?? []) as PedidoRow[]

  // Segmento RFM del cliente de cada pedido (solo los de la página en pantalla).
  const clienteIds = [...new Set(pedidos.map(p => p.cliente_id).filter(Boolean))]
  if (clienteIds.length > 0) {
    const { data: segs } = await supabase
      .from('vista_rfm_clientes')
      .select('cliente_id, segmento')
      .in('cliente_id', clienteIds)
    const porCliente = new Map(
      ((segs ?? []) as Array<{ cliente_id: string; segmento: ClienteSegmentoRfm }>)
        .map(s => [s.cliente_id, s.segmento])
    )
    for (const p of pedidos) p.cliente_segmento = porCliente.get(p.cliente_id) ?? null
  }

  const total = count ?? 0
  return {
    pedidos,
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

export async function getPedidoDetalle(id: string): Promise<PedidoDetalle | null> {
  const supabase = await createClient()

  const [pedidoRes, itemsRes, pagosRes, historialRes] = await Promise.all([
    supabase.from('vista_pedidos_asesor').select('*').eq('id', id).single(),
    supabase
      .from('pedido_items')
      .select('id, articulo_id, marca, descripcion, talla, cantidad, precio_venta, imagen_url, codigo, articulos(codigo)')
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
    itemsData = (fallback.data ?? []).map(it => ({ ...it, imagen_url: null, codigo: null }))
  } else {
    // El código puede venir del item o del artículo del catálogo vinculado.
    itemsData = (itemsRes.data ?? []).map((it: any) => {
      const art = Array.isArray(it.articulos) ? it.articulos[0] : it.articulos
      return { ...it, codigo: it.codigo ?? art?.codigo ?? null, articulos: undefined }
    })
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

// Muestra el PRÓXIMO número del consecutivo oficial sin consumirlo (para el
// formulario). El número definitivo lo asigna el servidor al guardar con
// asignarNumeroOrden() — el usuario nunca lo digita.
export async function getSiguienteNumeroOrden(sedeCodigo: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ver_proximo_numero_pedido')
  if (error || !data) return `${sedeCodigo}…`
  return `${sedeCodigo}${data}`
}

// Consume el consecutivo oficial (secuencia en la BD: atómico, sin duplicados
// ni carreras) y devuelve el número de orden definitivo para la sede.
export async function asignarNumeroOrden(sedeCodigo: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('asignar_numero_pedido')
  if (error || !data) return null
  return `${sedeCodigo}${data}`
}
