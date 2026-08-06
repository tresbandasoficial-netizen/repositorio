'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { asignarNumeroOrden } from '@/lib/queries/pedidos'

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

// ─── Cambio directo (talla u otro artículo) ──────────────────────────────────
// El cliente devuelve una prenda ENTREGADA y el cambio se registra como un
// PEDIDO NUEVO que vuelve a la cola del sistema. Sin bonos. Qué pasa:
//   1. La prenda devuelta ENTRA al inventario de la sede.
//   2. Si tenía compra asignada, esa compra se DESASIGNA (la entrada queda
//      amarrada al item de compra para que la sincronización de compras no la
//      duplique).
//   3. Se crea un PEDIDO NUEVO (consecutivo oficial, estado pendiente) con la
//      prenda en la talla nueva — o igual, para editarla si es otro artículo.
//   4. El valor del artículo se traslada como abono no-efectivo (método
//      'bono', cuenta NULL) al pedido nuevo. Funciona pagado O a crédito: si
//      el original tiene saldo, esa deuda sigue viva en el original/su factura
//      (Cartera la cobra allá) y el pedido nuevo queda con nota de aviso. El
//      saldo total del cliente no cambia ni se duplica.

export type CambioResult =
  | { ok: true; numeroOrden: string; nuevoPedidoId: string; nuevoNumero: string; abonoTrasladado: number }
  | { ok: false; error: string }

export async function registrarCambioAction(
  pedidoId: string,
  itemId: string,
  tallaNueva: string | null,   // null = cambio por otro artículo (se edita el pedido nuevo)
): Promise<CambioResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  const talla = tallaNueva?.trim() || null

  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, sede_id, cliente_id, estado, total, factura_id, notas, sedes(codigo)')
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
    .select('id, articulo_id, codigo, marca, descripcion, talla, cantidad, precio_venta, imagen_url, color, sexo, categoria')
    .eq('id', itemId)
    .eq('pedido_id', pedidoId)
    .single()
  if (!item) return { ok: false, error: 'No se encontró la prenda' }
  if (!item.articulo_id) {
    return { ok: false, error: `"${item.descripcion}" no está enlazada al catálogo — enlázala primero (Editar pedido) para poder entrar la prenda al inventario.` }
  }
  if (talla && (item.talla ?? '').trim().toLowerCase() === talla.toLowerCase()) {
    return { ok: false, error: 'La talla nueva es la misma que ya tiene' }
  }

  const admin = createAdminClient()

  // Funciona pagado O a crédito: el valor del artículo entra completo como
  // abono trasladado al pedido nuevo, y si el original tiene saldo, esa deuda
  // SIGUE viva en el original/su factura (donde Cartera ya la cobra). El saldo
  // total del cliente no cambia ni se duplica: sube su total en el valor del
  // pedido nuevo y sube su pagado en el mismo valor (el abono trasladado).
  const [{ data: pagosPed }, { data: pagosFac }] = await Promise.all([
    admin.from('pagos').select('monto').eq('pedido_id', pedidoId).eq('anulado', false).neq('metodo', 'credito'),
    pedido.factura_id
      ? admin.from('pagos_factura').select('monto').eq('factura_id', pedido.factura_id).eq('anulado', false).neq('metodo', 'credito')
      : Promise.resolve({ data: [] as Array<{ monto: number }> }),
  ])
  const pagadoTotal = [...(pagosPed ?? []), ...(pagosFac ?? [])].reduce((s, p: any) => s + (p.monto || 0), 0)
  const valorItem = (item.precio_venta || 0) * (item.cantidad || 1)
  const saldoOriginal = Math.max(0, (pedido.total || 0) - pagadoTotal)

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

  // 3. PEDIDO NUEVO con el consecutivo oficial: vuelve a la cola del sistema
  //    como cualquier pedido, en la talla nueva (o igual, si es cambio por
  //    otro artículo y lo van a editar).
  const sedeRel = pedido.sedes as { codigo?: string } | { codigo?: string }[] | null
  const sedeCodigo = (Array.isArray(sedeRel) ? sedeRel[0]?.codigo : sedeRel?.codigo) ?? pedido.numero_orden.replace(/^VL-/, '').slice(0, 2)
  const nuevoNumero = await asignarNumeroOrden(sedeCodigo)
  if (!nuevoNumero) return { ok: false, error: 'La prenda entró al inventario pero no se pudo asignar el número del pedido nuevo. Intenta de nuevo.' }

  const notaNuevo = `Cambio del pedido ${pedido.numero_orden}: ${item.marca} ${item.descripcion} T${item.talla || '—'}${talla ? ` → T${talla}` : ' → otro artículo (editar este pedido)'}${
    saldoOriginal > 0
      ? `\n⚠ OJO: el pedido original quedó DEBIENDO $${saldoOriginal.toLocaleString('es-CO')} — esa deuda se cobra por el ${pedido.numero_orden}/su factura (Cartera), NO por este pedido.`
      : ''
  }`
  const { data: nuevo, error: errNuevo } = await admin
    .from('pedidos')
    .insert({
      numero_orden: nuevoNumero,
      sede_id:      pedido.sede_id,
      cliente_id:   pedido.cliente_id,
      asesor_id:    sesion.id,
      estado:       'pendiente',
      tipo:         'encargo',
      total:        valorItem,
      tipo_entrega: 'sede',
      notas:        notaNuevo,
    })
    .select('id')
    .single()
  if (errNuevo || !nuevo) return { ok: false, error: `No se pudo crear el pedido nuevo: ${errNuevo?.message}` }

  const { error: errItemNuevo } = await admin.from('pedido_items').insert({
    pedido_id:    nuevo.id,
    articulo_id:  item.articulo_id,
    codigo:       item.codigo,
    marca:        item.marca,
    descripcion:  item.descripcion,
    talla:        talla ?? item.talla,
    cantidad:     item.cantidad,
    precio_venta: item.precio_venta,
    imagen_url:   item.imagen_url,
    color:        item.color,
    sexo:         item.sexo,
    categoria:    item.categoria,
  })
  if (errItemNuevo) return { ok: false, error: `El pedido ${nuevoNumero} se creó pero falló su artículo: ${errItemNuevo.message}` }

  await admin.from('historial_cambios').insert({
    tabla: 'pedidos', registro_id: nuevo.id, campo: 'estado',
    valor_anterior: null, valor_nuevo: 'pendiente', usuario_id: sesion.id,
  })

  // 4. Traslado del abono: la plata YA entró con la venta original (allá se
  //    queda, histórico limpio). Al nuevo pedido entra como abono no-efectivo
  //    (método bono, cuenta NULL) — no toca caja ni se cuenta dos veces.
  const { error: errPago } = await admin.from('pagos').insert({
    pedido_id: nuevo.id,
    monto:     valorItem,
    metodo:    'bono',
    cuenta_id: null,
    asesor_id: sesion.id,
    notas:     `Abono trasladado por cambio del ${pedido.numero_orden}`,
  })
  if (errPago) return { ok: false, error: `El pedido ${nuevoNumero} se creó pero falló el traslado del abono: ${errPago.message}` }

  // Nota cruzada en el pedido original.
  const notaOrig = `Cambio: ${item.marca} ${item.descripcion} T${item.talla || '—'} devuelta — continúa en el pedido ${nuevoNumero}`
  await admin
    .from('pedidos')
    .update({ notas: pedido.notas ? `${pedido.notas}\n${notaOrig}` : notaOrig })
    .eq('id', pedidoId)

  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/pedidos')
  revalidatePath('/inventario')
  return { ok: true, numeroOrden: pedido.numero_orden, nuevoPedidoId: nuevo.id, nuevoNumero, abonoTrasladado: valorItem }
}
