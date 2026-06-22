import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { FacturaRow, EstadoFactura } from '@/types'

export async function getFacturas(filtros?: {
  estado?: EstadoFactura
  sede?: string
  q?: string
}): Promise<FacturaRow[]> {
  const supabase = await createClient()
  const sesion = await getSesion()

  let query = supabase
    .from('vista_facturas')
    .select('*')
    .order('fecha_factura', { ascending: false })
    .limit(200)

  if (sesion.rol !== 'admin' && sesion.sede_id) query = query.eq('sede_id', sesion.sede_id)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)
  if (filtros?.sede)   query = query.eq('sede_codigo', filtros.sede)
  if (filtros?.q) {
    const t = filtros.q.trim()
    query = query.or(`numero_factura.ilike.%${t}%,cliente_nombre.ilike.%${t}%,cliente_telefono.ilike.%${t}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error cargando facturas: ${error.message}`)
  return (data ?? []) as FacturaRow[]
}

export type FacturaDetalle = FacturaRow & {
  pedidos: Array<{
    id: string
    numero_orden: string | null
    total: number
    fecha_creacion: string
    items: Array<{
      marca: string
      descripcion: string
      talla: string | null
      cantidad: number
      precio_venta: number
    }>
  }>
  abonos: Array<{
    id: string
    monto: number
    metodo: string
    fecha: string
    notas: string | null
    asesor_nombre: string
  }>
}

export async function getFacturaDetalle(id: string): Promise<FacturaDetalle | null> {
  const supabase = await createClient()

  const { data: factura, error } = await supabase
    .from('vista_facturas')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !factura) return null

  const sesion = await getSesion()
  if (sesion.rol !== 'admin' && factura.sede_id !== sesion.sede_id) return null

  const [pedidosRes, abonosRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero_orden, total, fecha_creacion, pedido_items(marca, descripcion, talla, cantidad, precio_venta)')
      .eq('factura_id', id)
      .order('fecha_creacion'),
    supabase
      .from('pagos_factura')
      .select('id, monto, metodo, fecha, notas, usuarios(nombre)')
      .eq('factura_id', id)
      .order('fecha'),
  ])

  const abonos = (abonosRes.data ?? []).map((a: any) => ({
    id: a.id,
    monto: a.monto,
    metodo: a.metodo,
    fecha: a.fecha,
    notas: a.notas,
    asesor_nombre: a.usuarios?.nombre ?? '',
  }))

  const pedidos = (pedidosRes.data ?? []).map((p: any) => ({
    id: p.id,
    numero_orden: p.numero_orden,
    total: p.total,
    fecha_creacion: p.fecha_creacion,
    items: (p.pedido_items ?? []),
  }))

  return {
    ...(factura as FacturaRow),
    pedidos,
    abonos,
  }
}

// Datos para el recibo/imagen de la factura.
export type ReciboFactura = {
  factura: FacturaRow
  sede_direccion: string | null
  items: Array<{ marca: string; descripcion: string; talla: string | null; cantidad: number; precio_venta: number }>
  abonos: Array<{ monto: number; metodo: string; fecha: string }>
}

export async function getFacturaRecibo(id: string): Promise<ReciboFactura | null> {
  const supabase = await createClient()
  const sesion = await getSesion()

  const { data: factura, error } = await supabase.from('vista_facturas').select('*').eq('id', id).single()
  if (error || !factura) return null
  if (sesion.rol !== 'admin' && factura.sede_id !== sesion.sede_id) return null

  const [pedidosRes, abonosRes, sedeRes] = await Promise.all([
    supabase.from('pedidos').select('id').eq('factura_id', id),
    supabase.from('pagos_factura').select('monto, metodo, fecha').eq('factura_id', id).order('fecha'),
    supabase.from('sedes').select('direccion').eq('id', factura.sede_id).single(),
  ])

  const pedidoIds = (pedidosRes.data ?? []).map((p: { id: string }) => p.id)
  let items: ReciboFactura['items'] = []
  if (pedidoIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('pedido_items')
      .select('marca, descripcion, talla, cantidad, precio_venta')
      .in('pedido_id', pedidoIds)
      .order('id')
    items = (itemsData ?? []) as ReciboFactura['items']
  }

  return {
    factura: factura as FacturaRow,
    sede_direccion: sedeRes.data?.direccion ?? null,
    items,
    abonos: (abonosRes.data ?? []) as ReciboFactura['abonos'],
  }
}

// Cuentas por cobrar: morosos + resumen por sede.
export async function getMorosos(): Promise<FacturaRow[]> {
  const supabase = await createClient()
  const sesion = await getSesion()

  let query = supabase
    .from('vista_morosos')
    .select('*')
    .order('dias_atraso', { ascending: false })

  if (sesion.rol !== 'admin' && sesion.sede_id) query = query.eq('sede_id', sesion.sede_id)

  const { data, error } = await query
  if (error) throw new Error(`Error cargando morosos: ${error.message}`)
  return (data ?? []) as FacturaRow[]
}

export type ResumenCxC = {
  totalPorCobrar: number   // saldo de todas las facturas pendientes/vencidas
  totalVencido: number     // saldo solo de las vencidas
  facturasPendientes: number
  facturasVencidas: number
}

export async function getResumenCxC(): Promise<ResumenCxC> {
  const supabase = await createClient()
  const sesion = await getSesion()

  let query = supabase
    .from('vista_facturas')
    .select('saldo, estado, dias_atraso')
    .in('estado', ['pendiente', 'vencida'])

  if (sesion.rol !== 'admin' && sesion.sede_id) query = query.eq('sede_id', sesion.sede_id)

  const { data } = await query
  const filas = (data ?? []) as Array<{ saldo: number; estado: string; dias_atraso: number }>

  let totalPorCobrar = 0, totalVencido = 0, pendientes = 0, vencidas = 0
  for (const f of filas) {
    if (f.saldo <= 0) continue
    totalPorCobrar += f.saldo
    if (f.dias_atraso > 0) { totalVencido += f.saldo; vencidas++ }
    else pendientes++
  }

  return {
    totalPorCobrar,
    totalVencido,
    facturasPendientes: pendientes,
    facturasVencidas: vencidas,
  }
}

// Pedidos entregados, sin factura, de un cliente (para armar una factura).
export async function getPedidosFacturables(clienteId: string, sedeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, numero_orden, total, fecha_creacion, tipo')
    .eq('cliente_id', clienteId)
    .eq('sede_id', sedeId)
    .eq('estado', 'entregado')
    .is('factura_id', null)
    .order('fecha_creacion')

  if (error) throw new Error(`Error cargando pedidos facturables: ${error.message}`)

  // Calcular abonos previos por pedido para mostrar la deuda neta.
  const pedidos = (data ?? []) as Array<{ id: string; numero_orden: string; total: number; fecha_creacion: string; tipo: string }>
  if (pedidos.length === 0) return []

  const ids = pedidos.map(p => p.id)
  const { data: pagos } = await supabase
    .from('pagos')
    .select('pedido_id, monto')
    .in('pedido_id', ids)

  const abonado = new Map<string, number>()
  for (const pg of (pagos ?? []) as Array<{ pedido_id: string; monto: number }>) {
    abonado.set(pg.pedido_id, (abonado.get(pg.pedido_id) ?? 0) + pg.monto)
  }

  return pedidos.map(p => ({
    ...p,
    abonado: abonado.get(p.id) ?? 0,
    saldo: p.total - (abonado.get(p.id) ?? 0),
  }))
}
