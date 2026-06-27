'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verificarAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (usuario?.rol !== 'admin') redirect('/dashboard')
  return { userId: user.id, adminClient: createAdminClient() }
}

export type CompraItemInput = {
  codigo?: string               // código SKU extraído de la factura
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  costo_unitario_cop: number
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  articulo_id?: string | null   // vínculo opcional al catálogo (para inventario)
  pedido_ref?: string           // "TR6492" o "TR6492-1" — asigna al pedido al crear
}

// Busca un pedido por número de orden (para el lookup en vivo del formulario).
export async function buscarPedidoPorOrdenAction(numeroOrden: string): Promise<
  { id: string; numero_orden: string; estado: string; cliente_nombre: string | null } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Acepta "TR6492" o "TR6492-1" → toma solo el número de orden
  const ref = numeroOrden.trim().toUpperCase()
  const orden = ref.match(/^(.+)-(\d+)$/)?.[1] ?? ref
  if (!orden) return null

  const { data } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado, cliente_id')
    .eq('numero_orden', orden)
    .maybeSingle()
  if (!data) return null

  const { data: cli } = await supabase
    .from('clientes').select('nombre').eq('id', data.cliente_id).maybeSingle()

  return { id: data.id, numero_orden: data.numero_orden, estado: data.estado, cliente_nombre: cli?.nombre ?? null }
}

export type CrearCompraInput = {
  tipo: 'usa' | 'colombia'
  proveedor: string
  fecha: string
  numero_factura: string
  total_usd: number | null
  trm: number | null
  total_cop: number
  notas: string
  cuenta_id: string | null
  items: CompraItemInput[]
}

export type CrearCompraResult =
  | { ok: true; compraId: string }
  | { ok: false; error: string }

export async function crearCompraAction(data: CrearCompraInput): Promise<CrearCompraResult> {
  const { userId, adminClient } = await verificarAdmin()

  const numeroFactura = data.numero_factura.trim() || null

  // Verificar duplicado por número de factura
  if (numeroFactura) {
    const { data: existente } = await adminClient
      .from('compras')
      .select('id, proveedor, fecha')
      .eq('numero_factura', numeroFactura)
      .maybeSingle()

    if (existente) {
      return {
        ok: false,
        error: `La factura "${numeroFactura}" ya fue registrada (${existente.proveedor} — ${existente.fecha})`,
      }
    }
  }

  const { data: compra, error: errCompra } = await adminClient
    .from('compras')
    .insert({
      tipo: data.tipo,
      proveedor: data.proveedor.trim(),
      fecha: data.fecha,
      numero_factura: numeroFactura,
      total_usd: data.total_usd,
      trm: data.trm,
      total_cop: data.total_cop,
      notas: data.notas.trim() || null,
      cuenta_id: data.cuenta_id || null,
      creado_por: userId,
    })
    .select('id')
    .single()

  if (errCompra || !compra) {
    return { ok: false, error: `Error creando compra: ${errCompra?.message}` }
  }

  for (const item of data.items) {
    const articuloId = item.articulo_id || null

    const { data: itemCreado, error: errItem } = await adminClient
      .from('compra_items')
      .insert({
        compra_id:          compra.id,
        codigo:             item.codigo?.trim() || null,
        descripcion:        item.descripcion.trim(),
        marca:              item.marca.trim() || null,
        talla:              item.talla.trim() || null,
        cantidad:           item.cantidad,
        costo_unitario_cop: item.costo_unitario_cop,
        destino:            item.destino,
        articulo_id:        articuloId,
      })
      .select('id')
      .single()

    if (errItem || !itemCreado) {
      return { ok: false, error: `Error creando item: ${errItem?.message}` }
    }

    // Asignación directa a pedido si viene el número (ej: "TR6492" o "TR6492-1").
    if (item.destino === 'pedido' && item.pedido_ref?.trim()) {
      const ref = item.pedido_ref.trim().toUpperCase()
      const m = ref.match(/^(.+)-(\d+)$/)
      const numeroOrden = m ? m[1] : ref
      const indice = m ? parseInt(m[2], 10) : null

      const { data: pedido } = await adminClient
        .from('pedidos').select('id, estado').eq('numero_orden', numeroOrden).maybeSingle()

      if (pedido) {
        await adminClient.from('compra_items')
          .update({ pedido_id: pedido.id, pedido_item_indice: indice })
          .eq('id', itemCreado.id)
        // El pedido avanza de pendiente → comprado al asignarle la compra.
        if (pedido.estado === 'pendiente') {
          await adminClient.from('pedidos')
            .update({ estado: 'comprado', fecha_actualizacion: new Date().toISOString() })
            .eq('id', pedido.id)
        }
        // Vincular el artículo del catálogo si aplica.
        await _resolverArticuloCompraItem(itemCreado.id, pedido.id, indice, adminClient)
      }
    }

    // Regla de inventario: si el ítem NO está asignado a un pedido y tiene
    // artículo de catálogo, entra al stock de Bucaramanga (centro de distribución).
    if (item.destino === 'sin_asignar' && articuloId) {
      const { error: errInv } = await adminClient.rpc('registrar_entrada_inventario', {
        p_articulo_id:    articuloId,
        p_talla:          item.talla.trim() || null,
        p_cantidad:       item.cantidad,
        p_costo_unitario: item.costo_unitario_cop,
        p_usuario_id:     userId,
        p_compra_item_id: itemCreado.id,
        p_sede_id:        null,
        p_notas:          `Compra ${numeroFactura ?? ''} — ${data.proveedor}`.trim(),
      })
      if (errInv) {
        return { ok: false, error: `Error registrando inventario: ${errInv.message}` }
      }
    }
  }

  // Crear gasto egreso si hay cuenta asignada (secundario: no debe romper la compra)
  try {
    await _sincronizarGastoCompra(
      compra.id, data.fecha, data.total_cop,
      data.proveedor.trim(), numeroFactura,
      data.cuenta_id || null, userId, adminClient
    )
  } catch (e) {
    console.error('Error sincronizando gasto de compra:', e)
  }

  return { ok: true as const, compraId: compra.id }
}

export type AsignarItemResult =
  | { ok: true }
  | { ok: false; error: string }

export async function asignarItemAction(
  itemId: string,
  destino: 'pedido' | 'contoda' | 'sin_asignar',
  pedidoRef?: string
): Promise<AsignarItemResult> {
  const { adminClient } = await verificarAdmin()

  let pedidoId: string | null = null
  let pedidoItemIndice: number | null = null

  if (destino === 'pedido') {
    if (!pedidoRef?.trim()) {
      return { ok: false, error: 'Debes indicar el número de orden del pedido' }
    }

    // Parsear "TR1025-1" → numeroOrden="TR1025", indice=1
    const ref = pedidoRef.trim().toUpperCase()
    const match = ref.match(/^(.+)-(\d+)$/)
    const numeroOrden = match ? match[1] : ref
    pedidoItemIndice = match ? parseInt(match[2], 10) : null

    const { data: pedido } = await adminClient
      .from('pedidos')
      .select('id, estado')
      .eq('numero_orden', numeroOrden)
      .single()

    if (!pedido) {
      return { ok: false, error: `Pedido "${numeroOrden}" no encontrado` }
    }

    pedidoId = pedido.id

    if (pedido.estado === 'pendiente') {
      await adminClient
        .from('pedidos')
        .update({ estado: 'comprado', fecha_actualizacion: new Date().toISOString() })
        .eq('id', pedido.id)
    }
  }

  const { error } = await adminClient
    .from('compra_items')
    .update({
      destino,
      pedido_id: pedidoId,
      pedido_item_indice: pedidoItemIndice,
      transferido_contoda: destino === 'contoda',
      transferido_en: destino === 'contoda' ? new Date().toISOString() : null,
    })
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }

  // Auto-vincular artículo del catálogo si aún no está vinculado
  if (destino === 'pedido') {
    await _resolverArticuloCompraItem(itemId, pedidoId, pedidoItemIndice, adminClient)
  }

  return { ok: true }
}

async function _resolverArticuloCompraItem(
  itemId: string,
  pedidoId: string | null,
  pedidoItemIndice: number | null,
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
) {
  const { data: item } = await adminClient
    .from('compra_items')
    .select('articulo_id, codigo, descripcion, marca, talla')
    .eq('id', itemId)
    .single()

  if (!item || item.articulo_id) return  // ya está vinculado

  let articuloId: string | null = null

  // Prioridad 1: heredar articulo_id del pedido_item si se conoce el índice
  if (pedidoId && pedidoItemIndice !== null) {
    const { data: pedidoItems } = await adminClient
      .from('pedido_items')
      .select('id, articulo_id')
      .eq('pedido_id', pedidoId)
      .order('id')

    const pedidoItem = pedidoItems?.[pedidoItemIndice - 1]
    if (pedidoItem?.articulo_id) {
      articuloId = pedidoItem.articulo_id
    }
  }

  // Prioridad 2: buscar por código SKU en el catálogo
  if (!articuloId && item.codigo) {
    const { data: existente } = await adminClient
      .from('articulos')
      .select('id')
      .ilike('codigo', item.codigo.trim())
      .maybeSingle()

    if (existente) {
      articuloId = existente.id
    } else {
      // Crear el artículo automáticamente con los datos de la factura
      const { data: nuevo } = await adminClient
        .from('articulos')
        .insert({
          codigo:  item.codigo.trim(),
          nombre:  item.descripcion.trim(),
          marca:   item.marca?.trim() || 'Sin marca',
        })
        .select('id')
        .single()
      articuloId = nuevo?.id ?? null
    }
  }

  if (articuloId) {
    await adminClient
      .from('compra_items')
      .update({ articulo_id: articuloId })
      .eq('id', itemId)
  }
}

// Crea o actualiza el gasto asociado a una compra (egreso de la cuenta elegida).
// El gasto descuenta el saldo de esa cuenta en el flujo de caja.
async function _sincronizarGastoCompra(
  compraId: string,
  fecha: string,
  totalCop: number,
  proveedor: string,
  numeroFactura: string | null,
  cuentaId: string | null,
  userId: string,
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
) {
  // Borrar gasto previo de esta compra (si existía)
  await adminClient.from('gastos').delete().eq('origen', 'compra').eq('origen_id', compraId)

  if (!cuentaId) return  // sin cuenta → sin egreso

  // gastos.sede_id es obligatorio. Si la cuenta tiene sede, se usa; si es una
  // cuenta global (Nequi, Addi, Bancolombia Huber…), el egreso se atribuye a
  // Bucaramanga, que es el hub donde se gestionan las compras.
  const { data: cuenta } = await adminClient
    .from('cuentas').select('sede_id').eq('id', cuentaId).maybeSingle()

  let sedeId = cuenta?.sede_id ?? null
  if (!sedeId) {
    const { data: tr } = await adminClient
      .from('sedes').select('id').eq('codigo', 'TR').maybeSingle()
    sedeId = tr?.id ?? null
  }
  if (!sedeId) return  // sin ninguna sede disponible (no debería pasar)

  await adminClient.from('gastos').insert({
    fecha,
    valor: totalCop,
    categoria: 'compras_mercancia',
    sede_id: sedeId,
    cuenta_id: cuentaId,
    responsable_id: userId,
    origen: 'compra',
    origen_id: compraId,
    observacion: `Compra ${numeroFactura ? '#' + numeroFactura + ' — ' : ''}${proveedor}`.trim(),
  })
}

export type EditarCompraInput = {
  proveedor: string
  fecha: string
  numero_factura: string
  tipo: 'usa' | 'colombia'
  total_usd: number | null
  trm: number | null
  total_cop: number
  notas: string
  cuenta_id: string | null
}

export type EditarCompraResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarCompraAction(compraId: string, data: EditarCompraInput): Promise<EditarCompraResult> {
  const { userId, adminClient } = await verificarAdmin()

  const numeroFactura = data.numero_factura.trim() || null

  // Verificar duplicado de número de factura excluyendo esta compra
  if (numeroFactura) {
    const { data: existentes } = await adminClient
      .from('compras')
      .select('id, proveedor, fecha')
      .eq('numero_factura', numeroFactura)
      .neq('id', compraId)
      .limit(1)
    const existente = existentes?.[0]
    if (existente) {
      return { ok: false, error: `La factura "${numeroFactura}" ya existe en otra compra (${existente.proveedor} — ${existente.fecha})` }
    }
  }

  const { error } = await adminClient
    .from('compras')
    .update({
      tipo:           data.tipo,
      proveedor:      data.proveedor.trim(),
      fecha:          data.fecha,
      numero_factura: numeroFactura,
      total_usd:      data.tipo === 'usa' ? data.total_usd : null,
      trm:            data.tipo === 'usa' ? data.trm : null,
      total_cop:      data.total_cop,
      notas:          data.notas.trim() || null,
      cuenta_id:      data.cuenta_id || null,
    })
    .eq('id', compraId)

  if (error) return { ok: false, error: error.message }

  // El egreso en flujo de caja es secundario: si falla, la compra ya se guardó.
  try {
    await _sincronizarGastoCompra(
      compraId, data.fecha, data.total_cop,
      data.proveedor.trim(), numeroFactura,
      data.cuenta_id || null, userId, adminClient
    )
  } catch (e) {
    console.error('Error sincronizando gasto de compra:', e)
  }

  revalidatePath('/compras')
  revalidatePath(`/compras/${compraId}`)
  revalidatePath('/flujo-caja')
  revalidatePath('/gastos')

  return { ok: true }
}

export type EliminarCompraResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarCompraAction(compraId: string): Promise<EliminarCompraResult> {
  const { adminClient } = await verificarAdmin()

  // Borrar gasto asociado antes de borrar la compra
  await adminClient.from('gastos').delete().eq('origen', 'compra').eq('origen_id', compraId)

  const { error } = await adminClient
    .from('compras')
    .delete()
    .eq('id', compraId)

  if (error) return { ok: false, error: error.message }

  redirect('/compras')
}
