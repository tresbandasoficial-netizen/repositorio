'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

// ─── Devoluciones / cambios ──────────────────────────────────────────────────
// El cliente devuelve prenda(s) de un pedido ENTREGADO para cambiarlas por
// otra talla u otro producto (que normalmente toca pedir):
//   1. La prenda devuelta ENTRA al inventario de la sede (movimiento 'entrada'
//      con nota de devolución) — queda disponible para venderse de nuevo.
//   2. El valor pagado se convierte en un BONO de cambio (sin movimiento de
//      caja: la plata ya había entrado con la venta original).
//   3. El nuevo pedido (la talla M, el otro producto…) se crea normal y se
//      paga con el código del bono (método 'bono', no-efectivo).

export type RegistrarDevolucionResult =
  | { ok: true; codigo: string; valor: number; entradas: string[] }
  | { ok: false; error: string }

export async function registrarDevolucionAction(
  pedidoId: string,
  itemIds: string[],
): Promise<RegistrarDevolucionResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  if (itemIds.length === 0) return { ok: false, error: 'Selecciona al menos una prenda devuelta' }

  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, sede_id, estado, cliente:clientes(nombre)')
    .eq('id', pedidoId)
    .single()
  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }
  if (pedido.estado !== 'entregado') {
    return { ok: false, error: 'Solo se registran devoluciones de pedidos ENTREGADOS.' }
  }

  const { data: items } = await supabase
    .from('pedido_items')
    .select('id, articulo_id, marca, descripcion, talla, cantidad, precio_venta')
    .eq('pedido_id', pedidoId)
    .in('id', itemIds)
  if (!items || items.length === 0) return { ok: false, error: 'No se encontraron las prendas' }

  const sinFicha = items.find(i => !i.articulo_id)
  if (sinFicha) {
    return {
      ok: false,
      error: `"${sinFicha.descripcion}" no está enlazada al catálogo — enlázala primero (editar pedido) para poder entrar la prenda al inventario.`,
    }
  }

  // 1. Entrada al inventario de cada prenda devuelta (RLS de movimientos es
  //    de admin: se usa el cliente admin, con la sesión ya validada arriba).
  const admin = createAdminClient()
  const entradas: string[] = []
  for (const it of items) {
    const { error } = await admin.from('movimientos_inventario').insert({
      articulo_id: it.articulo_id,
      sede_id:     pedido.sede_id,
      delta:       it.cantidad,
      tipo:        'entrada',
      talla:       it.talla || null,
      usuario_id:  sesion.id,
      pedido_id:   pedidoId,
      notas:       `Devolución ${pedido.numero_orden}: prenda recibida por cambio`,
    })
    if (error) return { ok: false, error: `No se pudo entrar "${it.descripcion}" al inventario: ${error.message}` }
    entradas.push(`${it.marca} ${it.descripcion}${it.talla ? ` T${it.talla}` : ''} ×${it.cantidad}`)
  }

  // 2. Bono de cambio por el valor devuelto (cuenta NULL = sin tocar caja)
  const valor = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const clienteNombre = (Array.isArray(pedido.cliente) ? pedido.cliente[0] : pedido.cliente)?.nombre ?? null
  const { data: codigo, error: errBono } = await supabase.rpc('crear_bono', {
    p_valor:      valor,
    p_cuenta_id:  null,
    p_sede_id:    pedido.sede_id,
    p_comprador:  clienteNombre,
    p_notas:      `Crédito por cambio/devolución del pedido ${pedido.numero_orden}`,
    p_usuario_id: sesion.id,
  })
  if (errBono || !codigo) {
    return { ok: false, error: `Las prendas entraron al inventario pero falló el bono: ${errBono?.message ?? 'sin código'}` }
  }

  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/inventario')
  revalidatePath('/bonos')
  return { ok: true, codigo: codigo as string, valor, entradas }
}
