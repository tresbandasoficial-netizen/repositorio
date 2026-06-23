'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { getSiguienteNumeroOrden } from '@/lib/queries/pedidos'
import { ItemVenta } from '@/app/actions/ventas'
import { normalizarTelefono } from '@/lib/utils/phone'
import { MetodoPago } from '@/types'

export type PedidoFacturable = {
  id: string
  numero_orden: string
  total: number
  abonado: number
  saldo: number
  fecha_creacion: string
  sede_id: string
  sede_codigo: string
}

// Pedidos entregados y sin factura de un cliente, dentro de la sede del usuario
// (admin ve todas las sedes). Incluye abonos previos para mostrar la deuda neta.
export async function getPedidosFacturablesAction(clienteId: string): Promise<PedidoFacturable[]> {
  const sesion = await getSesion()
  const supabase = await createClient()

  let q = supabase
    .from('pedidos')
    .select('id, numero_orden, total, fecha_creacion, sede_id, sedes(codigo)')
    .eq('cliente_id', clienteId)
    .neq('estado', 'cancelado')
    .is('factura_id', null)
    .order('fecha_creacion')

  if (sesion.rol !== 'admin' && sesion.sede_id) q = q.eq('sede_id', sesion.sede_id)

  const { data } = await q
  const pedidos = ((data ?? []) as any[]).map(p => ({
    id: p.id as string,
    numero_orden: p.numero_orden as string,
    total: p.total as number,
    fecha_creacion: p.fecha_creacion as string,
    sede_id: p.sede_id as string,
    sede_codigo: (Array.isArray(p.sedes) ? p.sedes[0]?.codigo : p.sedes?.codigo) ?? '',
  }))
  if (pedidos.length === 0) return []

  const ids = pedidos.map(p => p.id)
  const { data: pagos } = await supabase.from('pagos').select('pedido_id, monto').in('pedido_id', ids)
  const abonado = new Map<string, number>()
  for (const pg of (pagos ?? []) as Array<{ pedido_id: string; monto: number }>) {
    abonado.set(pg.pedido_id, (abonado.get(pg.pedido_id) ?? 0) + pg.monto)
  }

  return pedidos.map(p => ({
    id: p.id,
    numero_orden: p.numero_orden,
    total: p.total,
    abonado: abonado.get(p.id) ?? 0,
    saldo: p.total - (abonado.get(p.id) ?? 0),
    fecha_creacion: p.fecha_creacion,
    sede_id: p.sede_id,
    sede_codigo: p.sede_codigo,
  }))
}

export type PedidoEncontrado = {
  cliente_id: string
  cliente_nombre: string
  cliente_telefono: string
  pedido_id: string
}

// Busca un pedido por su número de orden para facturarlo directamente.
export async function buscarPedidoFacturableAction(
  numeroOrden: string
): Promise<{ ok: true; data: PedidoEncontrado } | { ok: false; error: string }> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const num = numeroOrden.trim().toUpperCase()
  if (!num) return { ok: false, error: 'Escribe un número de pedido' }

  const { data } = await supabase
    .from('pedidos')
    .select('id, cliente_id, sede_id, estado, factura_id, clientes(nombre, telefono_normalizado)')
    .eq('numero_orden', num)
    .maybeSingle()

  if (!data) return { ok: false, error: `No se encontró el pedido ${num}` }
  if (sesion.rol !== 'admin' && data.sede_id !== sesion.sede_id) {
    return { ok: false, error: `El pedido ${num} es de otra sede` }
  }
  if (data.estado === 'cancelado') {
    return { ok: false, error: `El pedido ${num} está cancelado, no se puede facturar` }
  }
  if (data.factura_id) {
    return { ok: false, error: `El pedido ${num} ya está facturado` }
  }

  const cli: any = Array.isArray(data.clientes) ? data.clientes[0] : data.clientes
  return {
    ok: true,
    data: {
      cliente_id: data.cliente_id,
      cliente_nombre: cli?.nombre ?? '',
      cliente_telefono: cli?.telefono_normalizado ?? '',
      pedido_id: data.id,
    },
  }
}

export type CrearFacturaInput = {
  cliente_id: string
  pedido_ids: string[]
  fecha_vencimiento: string
  notas: string
  abono_inicial: number
  metodo_abono: MetodoPago
  cuenta_id?: string | null
}

export type CrearFacturaResult =
  | { ok: true; facturaId: string }
  | { ok: false; error: string }

// Crea una factura agrupando 1..N pedidos entregados del mismo cliente y sede.
export async function crearFacturaAction(data: CrearFacturaInput): Promise<CrearFacturaResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (data.pedido_ids.length === 0) return { ok: false, error: 'Selecciona al menos un pedido' }
  if (!data.fecha_vencimiento) return { ok: false, error: 'La fecha de vencimiento es obligatoria' }

  // La sede de la factura = sede de los pedidos. Validamos que todos compartan sede
  // y que el asesor tenga acceso a ella.
  const { data: pedidos, error: errPed } = await supabase
    .from('pedidos')
    .select('id, sede_id, cliente_id, estado, factura_id')
    .in('id', data.pedido_ids)

  if (errPed) return { ok: false, error: errPed.message }
  if (!pedidos || pedidos.length !== data.pedido_ids.length) {
    return { ok: false, error: 'Algún pedido no existe' }
  }

  const sedeIds = new Set(pedidos.map(p => p.sede_id))
  if (sedeIds.size > 1) return { ok: false, error: 'Todos los pedidos deben ser de la misma sede' }
  const sedeId = pedidos[0].sede_id

  if (sesion.rol !== 'admin' && sedeId !== sesion.sede_id) {
    return { ok: false, error: 'No puedes facturar pedidos de otra sede' }
  }
  if (pedidos.some(p => p.cliente_id !== data.cliente_id)) {
    return { ok: false, error: 'Todos los pedidos deben ser del mismo cliente' }
  }
  if (pedidos.some(p => p.estado === 'cancelado')) {
    return { ok: false, error: 'No se puede facturar un pedido cancelado' }
  }
  if (pedidos.some(p => p.factura_id)) {
    return { ok: false, error: 'Algún pedido ya está facturado' }
  }

  const { data: facturaId, error } = await supabase.rpc('crear_factura', {
    p_cliente_id:        data.cliente_id,
    p_sede_id:           sedeId,
    p_asesor_id:         sesion.id,
    p_fecha_vencimiento: data.fecha_vencimiento,
    p_pedido_ids:        data.pedido_ids,
    p_notas:             data.notas.trim() || null,
    p_abono_inicial:     data.abono_inicial || 0,
    p_metodo_abono:      data.metodo_abono || null,
    p_cuenta_id:         data.cuenta_id || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/facturacion')
  return { ok: true as const, facturaId }
}

// ─── Factura unificada: pedidos existentes + productos nuevos del inventario ───

export type CrearFacturaUnificadaInput = {
  cliente_id: string | null
  cliente_nuevo?: { nombre: string; telefono: string; cedula: string } | null
  sede_id: string
  pedido_ids: string[]              // pedidos existentes del cliente a incluir
  productos_nuevos: ItemVenta[]     // productos sacados del inventario, se venden ahora
  fecha_vencimiento: string
  abono_inicial: number
  metodo_abono: MetodoPago
  cuenta_id: string | null
  envio: number
  descuento: number
  notas: string
}

export async function crearFacturaUnificadaAction(
  data: CrearFacturaUnificadaInput
): Promise<CrearFacturaResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (data.pedido_ids.length === 0 && data.productos_nuevos.length === 0) {
    return { ok: false, error: 'Agrega al menos un pedido o un producto' }
  }
  if (!data.fecha_vencimiento) return { ok: false, error: 'La fecha de vencimiento es obligatoria' }

  const sedeId = sesion.rol === 'admin' ? data.sede_id : sesion.sede_id
  if (!sedeId) return { ok: false, error: 'Selecciona una sede' }
  if (sesion.rol !== 'admin' && data.sede_id && data.sede_id !== sesion.sede_id) {
    return { ok: false, error: 'No puedes facturar en otra sede' }
  }

  // Resolver cliente: existente o crear uno nuevo.
  let clienteId = data.cliente_id
  if (!clienteId && data.cliente_nuevo) {
    if (!data.cliente_nuevo.nombre.trim()) return { ok: false, error: 'El nombre del cliente es obligatorio' }
    const tel = normalizarTelefono(data.cliente_nuevo.telefono)
    if (!tel) return { ok: false, error: 'Teléfono del cliente inválido' }

    const { data: existente } = await supabase
      .from('clientes').select('id').eq('telefono_normalizado', tel).maybeSingle()
    if (existente) {
      clienteId = existente.id
    } else {
      const { data: nuevo, error: errCli } = await supabase
        .from('clientes')
        .insert({ telefono_normalizado: tel, nombre: data.cliente_nuevo.nombre.trim(), cedula: data.cliente_nuevo.cedula.trim() || null })
        .select('id').single()
      if (errCli || !nuevo) return { ok: false, error: `Error creando cliente: ${errCli?.message}` }
      clienteId = nuevo.id
    }
  }
  if (!clienteId) return { ok: false, error: 'Selecciona o crea un cliente' }

  const pedidoIds = [...data.pedido_ids]

  // 1. Si hay productos nuevos Y hay pedidos previos, se crea una venta (entregada) que entra a la factura.
  // Si solo hay productos nuevos (sin pedidos previos), NO crear número de pedido, solo factura.
  if (data.productos_nuevos.length > 0 && data.pedido_ids.length > 0) {
    for (const it of data.productos_nuevos) {
      if (it.cantidad <= 0) return { ok: false, error: 'Cantidad inválida en un producto' }
      if (it.precio_venta < 0) return { ok: false, error: 'Precio inválido en un producto' }
    }
    const { data: sede } = await supabase.from('sedes').select('codigo').eq('id', sedeId).single()
    if (!sede) return { ok: false, error: 'Sede no encontrada' }

    const numeroOrden = await getSiguienteNumeroOrden(sede.codigo)
    const totalNuevos = data.productos_nuevos.reduce((s, it) => s + it.precio_venta * it.cantidad, 0)

    const { data: ventaPedidoId, error: errVenta } = await supabase.rpc('registrar_venta_inmediata', {
      p_numero_orden: numeroOrden,
      p_sede_id:      sedeId,
      p_asesor_id:    sesion.id,
      p_cliente_id:   clienteId,
      p_total:        totalNuevos,
      p_items:        data.productos_nuevos.map(it => ({
        articulo_id: it.articulo_id,
        marca: it.marca.trim(),
        descripcion: it.descripcion.trim(),
        talla: it.talla.trim(),
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
        color: it.color,
        sexo: it.sexo,
        categoria: it.categoria,
      })),
      p_abono:       0,   // el pago se registra a nivel de factura
      p_cuenta_id:   null,
      p_notas:       'Productos agregados al facturar',
    })
    if (errVenta) return { ok: false, error: `Error creando la venta: ${errVenta.message}` }
    pedidoIds.push(ventaPedidoId)
  } else if (data.productos_nuevos.length > 0 && data.pedido_ids.length === 0) {
    // Solo venta del local (sin pedidos previos): guardar productos en la factura sin número de pedido
    for (const it of data.productos_nuevos) {
      if (it.cantidad <= 0) return { ok: false, error: 'Cantidad inválida en un producto' }
      if (it.precio_venta < 0) return { ok: false, error: 'Precio inválido en un producto' }
    }
    // Los productos se guardarán directamente en la factura via un insert después
  }

  // 2. Crear la factura
  let facturaId: string
  let error: any

  if (pedidoIds.length === 0) {
    // Venta del local sin pedidos previos
    const { data: fId, error: err } = await supabase.rpc('crear_factura_venta_local', {
      p_cliente_id:        clienteId,
      p_sede_id:           sedeId,
      p_asesor_id:         sesion.id,
      p_fecha_vencimiento: data.fecha_vencimiento,
      p_productos:         data.productos_nuevos.map(it => ({
        articulo_id: it.articulo_id,
        marca: it.marca.trim(),
        descripcion: it.descripcion.trim(),
        talla: it.talla.trim(),
        cantidad: it.cantidad,
        precio_venta: it.precio_venta,
        color: it.color,
        sexo: it.sexo,
        categoria: it.categoria,
      })),
      p_abono_inicial:     data.abono_inicial || 0,
      p_metodo_abono:      data.metodo_abono || null,
      p_cuenta_id:         data.cuenta_id || null,
      p_envio:             data.envio || 0,
      p_descuento:         data.descuento || 0,
      p_notas:             data.notas.trim() || null,
    })
    facturaId = fId
    error = err
  } else {
    // Factura con pedidos previos (y posiblemente productos nuevos)
    const { data: fId, error: err } = await supabase.rpc('crear_factura', {
      p_cliente_id:        clienteId,
      p_sede_id:           sedeId,
      p_asesor_id:         sesion.id,
      p_fecha_vencimiento: data.fecha_vencimiento,
      p_pedido_ids:        pedidoIds,
      p_notas:             data.notas.trim() || null,
      p_abono_inicial:     data.abono_inicial || 0,
      p_metodo_abono:      data.metodo_abono || null,
      p_cuenta_id:         data.cuenta_id || null,
      p_envio:             data.envio || 0,
      p_descuento:         data.descuento || 0,
    })
    facturaId = fId
    error = err
  }

  if (error) return { ok: false, error: error.message }

  revalidatePath('/facturacion')
  return { ok: true as const, facturaId }
}

export type PagoFacturaInput = {
  factura_id: string
  monto: number
  metodo: MetodoPago
  fecha: string
  notas: string
  cuenta_id: string
}

export type SimpleResult = { ok: true } | { ok: false; error: string }

export async function registrarPagoFacturaAction(data: PagoFacturaInput): Promise<SimpleResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  // Verificar acceso a la factura por sede.
  const { data: factura } = await supabase
    .from('facturas')
    .select('sede_id, estado')
    .eq('id', data.factura_id)
    .single()
  if (!factura) return { ok: false, error: 'Factura no encontrada' }
  if (sesion.rol !== 'admin' && factura.sede_id !== sesion.sede_id) {
    return { ok: false, error: 'Sin acceso a esta factura' }
  }

  const { error } = await supabase.rpc('registrar_pago_factura', {
    p_factura_id: data.factura_id,
    p_monto:      data.monto,
    p_metodo:     data.metodo,
    p_fecha:      data.fecha,
    p_asesor_id:  sesion.id,
    p_cuenta_id:  data.cuenta_id,
    p_notas:      data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/facturacion/${data.factura_id}`)
  redirect(`/facturacion/${data.factura_id}`)
}

// Busca una factura por número para vincularla a un domicilio.
export async function buscarFacturaPorNumeroAction(numero: string): Promise<{
  id: string
  saldo: number
  cliente_nombre: string
  numero_factura: string
} | null> {
  const num = numero.trim().toUpperCase()
  if (!num) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_facturas')
    .select('id, saldo, cliente_nombre, numero_factura')
    .ilike('numero_factura', num)
    .maybeSingle()
  if (!data || (data as any).saldo <= 0) return null
  return data as { id: string; saldo: number; cliente_nombre: string; numero_factura: string }
}

// Anular factura: libera los pedidos vinculados. Solo admin.
export async function anularFacturaAction(facturaId: string): Promise<SimpleResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede anular facturas' }
  const supabase = await createClient()

  const { error } = await supabase.rpc('anular_factura', { p_factura_id: facturaId })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/facturacion')
  return { ok: true }
}
