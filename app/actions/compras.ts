'use server'

import { redirect } from 'next/navigation'
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

export type EliminarCompraResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarCompraAction(compraId: string): Promise<EliminarCompraResult> {
  const { adminClient } = await verificarAdmin()

  const { error } = await adminClient
    .from('compras')
    .delete()
    .eq('id', compraId)

  if (error) return { ok: false, error: error.message }

  redirect('/compras')
}
