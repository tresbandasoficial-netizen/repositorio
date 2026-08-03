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

// ─── Cambio de talla directo ─────────────────────────────────────────────────
// El cliente devuelve la prenda para la MISMA prenda en otra talla. Sin bono:
// la plata pagada se queda en el mismo pedido. Qué pasa:
//   1. La prenda de la talla vieja ENTRA al inventario de la sede.
//   2. Si tenía compra asignada, esa compra se DESASIGNA (la entrada queda
//      amarrada al item de compra para que la sincronización de compras no la
//      duplique) — así el pedido vuelve a aparecer en "falta comprar".
//   3. La talla del artículo se actualiza a la nueva.
//   4. El pedido vuelve a estado PENDIENTE para pedirlo de nuevo.

export type CambioTallaResult =
  | { ok: true; numeroOrden: string; tallaVieja: string; tallaNueva: string }
  | { ok: false; error: string }

export async function registrarCambioTallaAction(
  pedidoId: string,
  itemId: string,
  tallaNueva: string,
): Promise<CambioTallaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  const talla = tallaNueva.trim()
  if (!talla) return { ok: false, error: 'Escribe la talla nueva' }

  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, sede_id, estado, notas')
    .eq('id', pedidoId)
    .single()
  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }
  if (pedido.estado !== 'entregado') {
    return { ok: false, error: 'Solo se hacen cambios de pedidos ENTREGADOS.' }
  }

  const { data: item } = await supabase
    .from('pedido_items')
    .select('id, articulo_id, codigo, marca, descripcion, talla, cantidad')
    .eq('id', itemId)
    .eq('pedido_id', pedidoId)
    .single()
  if (!item) return { ok: false, error: 'No se encontró la prenda' }
  if (!item.articulo_id) {
    return { ok: false, error: `"${item.descripcion}" no está enlazada al catálogo — enlázala primero (Editar pedido) para poder entrar la prenda al inventario.` }
  }
  if ((item.talla ?? '').trim().toLowerCase() === talla.toLowerCase()) {
    return { ok: false, error: 'La talla nueva es la misma que ya tiene' }
  }

  const admin = createAdminClient()

  // 1 + 2. Entrada al stock de la talla vieja, desasignando su compra si la hay.
  const { data: comprasPedido } = await admin
    .from('compra_items')
    .select('id, talla, codigo, articulo_id, cantidad, costo_unitario_cop')
    .eq('pedido_id', pedidoId)
  const tallaVieja = (item.talla ?? '').trim().toLowerCase()
  const codItem = (item.codigo ?? '').trim().toUpperCase()
  const candidatos = ((comprasPedido ?? []) as Array<{ id: string; talla: string | null; codigo: string | null; articulo_id: string | null; cantidad: number; costo_unitario_cop: number | null }>)
    .filter(c =>
      (c.articulo_id && c.articulo_id === item.articulo_id) ||
      (c.codigo && codItem && c.codigo.trim().toUpperCase() === codItem)
    )
    // Primero la compra de la talla que se devuelve; luego las demás.
    .sort((a, b) =>
      ((a.talla ?? '').trim().toLowerCase() === tallaVieja ? 0 : 1) -
      ((b.talla ?? '').trim().toLowerCase() === tallaVieja ? 0 : 1)
    )

  let porCubrir = item.cantidad || 1
  for (const c of candidatos) {
    if (porCubrir <= 0) break
    const { error: errDes } = await admin
      .from('compra_items')
      .update({ pedido_id: null, pedido_item_indice: null })
      .eq('id', c.id)
    if (errDes) return { ok: false, error: `No se pudo desasignar la compra: ${errDes.message}` }
    const { error: errMov } = await admin.from('movimientos_inventario').insert({
      articulo_id:        item.articulo_id,
      talla:              item.talla || null,
      sede_id:            pedido.sede_id,
      delta:              c.cantidad,
      tipo:               'entrada',
      compra_item_id:     c.id,
      pedido_id:          pedidoId,
      costo_unitario_cop: c.costo_unitario_cop,
      usuario_id:         sesion.id,
      notas:              `Cambio de talla ${pedido.numero_orden}: entra T${item.talla || '—'}`,
    })
    if (errMov) return { ok: false, error: `No se pudo entrar la prenda al inventario: ${errMov.message}` }
    porCubrir -= c.cantidad || 1
  }
  if (porCubrir > 0) {
    // Sin compra asignada (o no alcanzó): la prenda igual entra al stock.
    const { error: errMov } = await admin.from('movimientos_inventario').insert({
      articulo_id: item.articulo_id,
      talla:       item.talla || null,
      sede_id:     pedido.sede_id,
      delta:       porCubrir,
      tipo:        'entrada',
      pedido_id:   pedidoId,
      usuario_id:  sesion.id,
      notas:       `Cambio de talla ${pedido.numero_orden}: entra T${item.talla || '—'}`,
    })
    if (errMov) return { ok: false, error: `No se pudo entrar la prenda al inventario: ${errMov.message}` }
  }

  // 3. La prenda queda pedida en la talla nueva.
  const { error: errTalla } = await admin
    .from('pedido_items')
    .update({ talla })
    .eq('id', itemId)
  if (errTalla) return { ok: false, error: `No se pudo cambiar la talla: ${errTalla.message}` }

  // 4. El pedido vuelve a la cola de compra (con historial del cambio de estado).
  const { error: errEstado } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    pedidoId,
    p_nuevo_estado: 'pendiente',
    p_usuario_id:   sesion.id,
  })
  if (errEstado) return { ok: false, error: `La talla quedó cambiada pero no se pudo devolver el pedido a pendiente: ${errEstado.message}` }

  // Nota visible en el pedido para que se sepa por qué volvió a pendiente.
  const nota = `Cambio de talla: ${item.marca} ${item.descripcion} T${item.talla || '—'} → T${talla}`
  await admin
    .from('pedidos')
    .update({ notas: pedido.notas ? `${pedido.notas}\n${nota}` : nota })
    .eq('id', pedidoId)

  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/pedidos')
  revalidatePath('/inventario')
  return { ok: true, numeroOrden: pedido.numero_orden, tallaVieja: item.talla || '—', tallaNueva: talla }
}
