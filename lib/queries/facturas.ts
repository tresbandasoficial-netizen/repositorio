import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { FacturaRow, EstadoFactura } from '@/types'

export type FacturaListRow = FacturaRow & { numeros_orden: string[]; metodos: string[] }

export async function getFacturas(filtros?: {
  estado?: EstadoFactura
  sede?: string
  q?: string
}): Promise<FacturaListRow[]> {
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
  const facturas = (data ?? []) as FacturaRow[]
  if (facturas.length === 0) return []

  // Traer los números de pedido y los métodos de pago de cada factura.
  const ids = facturas.map(f => f.id)
  const [pedsRes, pagosRes] = await Promise.all([
    supabase.from('pedidos').select('factura_id, numero_orden').in('factura_id', ids).order('numero_orden'),
    supabase.from('pagos_factura').select('factura_id, metodo').in('factura_id', ids).eq('anulado', false),
  ])

  const porFactura = new Map<string, string[]>()
  for (const p of (pedsRes.data ?? []) as Array<{ factura_id: string | null; numero_orden: string }>) {
    if (!p.factura_id) continue
    const arr = porFactura.get(p.factura_id) ?? []
    arr.push(p.numero_orden)
    porFactura.set(p.factura_id, arr)
  }

  // Métodos distintos por factura (una factura puede tener abonos por varias cuentas).
  const metodosPorFactura = new Map<string, string[]>()
  for (const pg of (pagosRes.data ?? []) as Array<{ factura_id: string | null; metodo: string }>) {
    if (!pg.factura_id) continue
    const arr = metodosPorFactura.get(pg.factura_id) ?? []
    if (!arr.includes(pg.metodo)) arr.push(pg.metodo)
    metodosPorFactura.set(pg.factura_id, arr)
  }

  return facturas.map(f => ({
    ...f,
    numeros_orden: porFactura.get(f.id) ?? [],
    metodos: metodosPorFactura.get(f.id) ?? [],
  }))
}

export type DomicilioFactura = {
  id: string
  fecha: string
  mensajeria: 'exneider' | 'servigo'
  direccion: string | null
  valor_pedido: number
  valor_domicilio: number
  valor_a_cobrar: number
  cobrar_al_cliente: boolean
  tipo_cobro: string | null
  metodo_pago: 'efectivo' | 'transferencia'
  estado: string
  articulo: string | null
  numero_pedido: string | null
  notas: string | null
  cliente_nombre: string
  cliente_telefono: string | null
}

export type FacturaDetalle = FacturaRow & {
  pedidos: Array<{
    id: string
    numero_orden: string
    total: number
    fecha_creacion: string
  }>
  abonos: Array<{
    id: string
    monto: number
    metodo: string
    fecha: string
    notas: string | null
    asesor_nombre: string
  }>
  domicilio: DomicilioFactura | null
}

export async function getFacturaDetalle(id: string): Promise<FacturaDetalle | null> {
  const supabase = await createClient()

  const { data: factura, error } = await supabase
    .from('vista_facturas')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !factura) return null

  // Verificar acceso por sede (defensa además del page-level).
  const sesion = await getSesion()
  if (sesion.rol !== 'admin' && factura.sede_id !== sesion.sede_id) return null

  const [pedidosRes, abonosRes, domicilioRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero_orden, total, fecha_creacion')
      .eq('factura_id', id)
      .order('fecha_creacion'),
    supabase
      .from('pagos_factura')
      .select('id, monto, metodo, fecha, notas, usuarios(nombre)')
      .eq('factura_id', id)
      .eq('anulado', false)
      .order('fecha'),
    supabase
      .from('domicilios')
      .select('id, fecha, mensajeria, direccion, valor_pedido, valor_domicilio, valor_a_cobrar, cobrar_al_cliente, tipo_cobro, metodo_pago, estado, articulo, numero_pedido, notas, cliente_nombre, cliente_telefono')
      .eq('factura_id', id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const abonos = (abonosRes.data ?? []).map((a: any) => ({
    id: a.id,
    monto: a.monto,
    metodo: a.metodo,
    fecha: a.fecha,
    notas: a.notas,
    asesor_nombre: a.usuarios?.nombre ?? '',
  }))

  return {
    ...(factura as FacturaRow),
    pedidos: (pedidosRes.data ?? []) as FacturaDetalle['pedidos'],
    abonos,
    domicilio: (domicilioRes.data ?? null) as DomicilioFactura | null,
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
    supabase.from('pagos_factura').select('monto, metodo, fecha').eq('factura_id', id).eq('anulado', false).order('fecha'),
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
    .eq('anulado', false)
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
