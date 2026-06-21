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
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  costo_unitario_cop: number
  destino: 'pedido' | 'contoda' | 'sin_asignar'
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
    const { error: errItem } = await adminClient.from('compra_items').insert({
      compra_id: compra.id,
      descripcion: item.descripcion.trim(),
      marca: item.marca.trim() || null,
      talla: item.talla.trim() || null,
      cantidad: item.cantidad,
      costo_unitario_cop: item.costo_unitario_cop,
      destino: item.destino,
    })

    if (errItem) {
      return { ok: false, error: `Error creando item: ${errItem.message}` }
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

  return { ok: true }
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
