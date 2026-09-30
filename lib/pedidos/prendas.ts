// Estado por prenda (mig. 205): el pedido sigue siendo uno; cada prenda lleva
// su propio estado y el del pedido es el de su prenda más atrasada.

import type { SupabaseClient } from '@supabase/supabase-js'

export type PrendaPedido = {
  id: string
  estado: string
  articulo_id: string | null
  codigo: string | null
  talla: string | null
}

export const EN_CAMINO = ['pendiente', 'comprado', 'usa']

// Prendas en el orden que usan la galería, las etiquetas (TR7900-1, -2…) y
// compra_items.pedido_item_indice: por id.
export async function prendasDePedido(client: SupabaseClient, pedidoId: string): Promise<PrendaPedido[]> {
  const { data, error } = await client
    .from('pedido_items')
    .select('id, estado, articulo_id, codigo, talla, articulos(codigo)')
    .eq('pedido_id', pedidoId)
    .order('id')
  if (error) throw new Error(`No se pudieron leer las prendas: ${error.message}`)
  return ((data ?? []) as Array<PrendaPedido & { articulos: { codigo: string | null } | { codigo: string | null }[] | null }>)
    .map(p => {
      const art = Array.isArray(p.articulos) ? p.articulos[0] : p.articulos
      return { id: p.id, estado: p.estado, articulo_id: p.articulo_id, codigo: p.codigo ?? art?.codigo ?? null, talla: p.talla }
    })
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

// Qué prenda del pedido corresponde a una compra, etiqueta o envío: con una sola
// prenda es esa; si no, la posición (1 = primera); si no hay posición, la del
// mismo artículo (o código) y talla, saltando las `excluir` (ya tomadas por otra
// unidad de la misma compra). null = no se puede saber.
export function identificarPrenda(
  prendas: PrendaPedido[],
  pista: { indice?: number | null; articulo_id?: string | null; codigo?: string | null; talla?: string | null },
  excluir?: Set<string>,
): PrendaPedido | null {
  if (prendas.length === 0) return null
  if (prendas.length === 1) return prendas[0]
  if (pista.indice != null && pista.indice >= 1 && pista.indice <= prendas.length) return prendas[pista.indice - 1]
  const candidatas = prendas.filter(p =>
    !excluir?.has(p.id) &&
    norm(p.talla) === norm(pista.talla) &&
    ((pista.articulo_id && p.articulo_id === pista.articulo_id) || (!!pista.codigo && norm(p.codigo) === norm(pista.codigo)))
  )
  return candidatas[0] ?? null
}

// Tras asignar una fila de compra a un pedido: SOLO su prenda pasa a
// 'comprado'. Si el pedido tiene varias prendas y no se sabe cuál es, no se
// mueve ninguna (antes pasaba el pedido completo, aunque lo demás no se
// hubiera comprado).
export async function marcarPrendaDeCompra(client: SupabaseClient, compraItemId: string, usuarioId: string): Promise<void> {
  const { data: ci, error } = await client
    .from('compra_items')
    .select('pedido_id, pedido_item_indice, articulo_id, codigo, talla')
    .eq('id', compraItemId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!ci?.pedido_id) return

  const prendas = await prendasDePedido(client, ci.pedido_id)
  const prenda = identificarPrenda(prendas, {
    indice: ci.pedido_item_indice, articulo_id: ci.articulo_id, codigo: ci.codigo, talla: ci.talla,
  })
  if (!prenda) return

  const { error: errRpc } = await client.rpc('marcar_prenda_comprada', {
    p_pedido_id:  ci.pedido_id,
    p_indice:     prendas.findIndex(p => p.id === prenda.id) + 1,
    p_usuario_id: usuarioId,
  })
  if (errRpc) throw new Error(errRpc.message)
}
