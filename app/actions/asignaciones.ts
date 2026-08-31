'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Confirmación de sugerencias compra→pedido (asignaciones_pendientes).
// Las sugerencias las crea _sugerirComprasLibres al crear un pedido; aquí el
// admin decide. Confirmar hace TODO lo que antes hacía la asignación
// automática: compra_item→pedido, salida de stock si ya llegó, estado del
// pedido y nota de constancia. Como entre la sugerencia y la confirmación el
// mundo puede cambiar (el pedido se edita, se separa por prendas, se cancela,
// otra compra se le asigna por el flujo manual, u otro admin confirma a la
// vez), aquí se revalida TODO y cada paso decisivo es un update condicionado
// que verifica filas afectadas — un update de Supabase que no matchea filas
// NO devuelve error.

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

export type ResolverAsignacionResult =
  | { ok: true; mensaje: string }
  | { ok: false; error: string }

export async function confirmarAsignacionAction(asignacionId: string): Promise<ResolverAsignacionResult> {
  const { userId, adminClient } = await verificarAdmin()
  const supabase = await createClient()
  const ahora = new Date().toISOString()

  // La sugerencia deja de ser válida: se descarta sola y se explica por qué.
  const descartar = async (motivo: string): Promise<ResolverAsignacionResult> => {
    await adminClient
      .from('asignaciones_pendientes')
      .update({ estado: 'rechazada', resuelto_en: ahora, resuelto_por: userId })
      .eq('id', asignacionId)
      .eq('estado', 'pendiente')
    revalidatePath('/compras')
    return { ok: false, error: `${motivo} — la sugerencia quedó descartada` }
  }

  const { data: asig } = await adminClient
    .from('asignaciones_pendientes')
    .select(`
      id, estado, pedido_id, compra_item_id,
      compra_item:compra_items (id, descripcion, marca, talla, codigo, articulo_id, cantidad,
        costo_unitario_cop, pedido_id, destino,
        compras (numero_factura, proveedor, llegada_en)),
      pedido:pedidos (id, numero_orden, estado, notas)
    `)
    .eq('id', asignacionId)
    .maybeSingle()
  if (!asig) return { ok: false, error: 'Sugerencia no encontrada' }
  if (asig.estado !== 'pendiente') return { ok: false, error: 'Esta sugerencia ya fue resuelta' }

  const item = (Array.isArray(asig.compra_item) ? asig.compra_item[0] : asig.compra_item) as any
  const pedido = (Array.isArray(asig.pedido) ? asig.pedido[0] : asig.pedido) as any
  if (!item || !pedido) return { ok: false, error: 'La compra o el pedido ya no existen' }
  if (pedido.estado === 'cancelado') return descartar(`El pedido ${pedido.numero_orden} está cancelado`)
  if (pedido.estado === 'entregado') return descartar(`El pedido ${pedido.numero_orden} ya se entregó`)
  if (item.pedido_id || item.destino !== 'sin_asignar') {
    return descartar('Esa unidad de compra ya fue asignada por otro lado')
  }

  // El pedido debe seguir llevando el artículo: desde que se creó la
  // sugerencia pudo editarse o separarse por prendas (el índice guardado no
  // sirve — se recalcula contra los items actuales).
  const { data: itemsPed } = await adminClient
    .from('pedido_items')
    .select('id, articulo_id, codigo, talla, cantidad')
    .eq('pedido_id', asig.pedido_id)
    .order('id')
  const lista = (itemsPed ?? []) as any[]
  const talla = (item.talla ?? '').trim().toUpperCase()
  const cod = (item.codigo ?? '').trim().toUpperCase()
  let indiceMatch: number | null = null
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i]
    if (((p.talla ?? '').trim().toUpperCase()) !== talla) continue
    const mismo = item.articulo_id
      ? p.articulo_id === item.articulo_id
      : (cod !== '' && (p.codigo ?? '').trim().toUpperCase() === cod)
    if (mismo) { indiceMatch = i + 1; break }
  }
  if (indiceMatch === null) {
    return descartar(`El pedido ${pedido.numero_orden} ya no lleva ese artículo (¿se editó o se separó?)`)
  }

  // El pedido no puede quedar con más compra que artículos (misma validación
  // del flujo manual de compras): otra compra pudo asignársele mientras la
  // sugerencia esperaba.
  const unidadesPedido = lista.reduce((s, p) => s + (p.cantidad ?? 1), 0)
  const { data: yaAsignadas } = await adminClient
    .from('compra_items')
    .select('cantidad')
    .eq('pedido_id', asig.pedido_id)
  const unidadesCompradas = ((yaAsignadas ?? []) as any[]).reduce((s, c) => s + (c.cantidad ?? 1), 0)
  if (unidadesCompradas + (item.cantidad ?? 1) > unidadesPedido) {
    return descartar(`El pedido ${pedido.numero_orden} ya tiene su compra completa (${unidadesCompradas} de ${unidadesPedido} unidades) — confirmar duplicaría el costo`)
  }

  // Candado 1: reclamar la sugerencia. Solo un clic gana; el resto ve el aviso.
  const { data: claim } = await adminClient
    .from('asignaciones_pendientes')
    .update({ estado: 'confirmada', resuelto_en: ahora, resuelto_por: userId })
    .eq('id', asignacionId)
    .eq('estado', 'pendiente')
    .select('id')
  if (!claim || claim.length === 0) {
    return { ok: false, error: 'Esta sugerencia ya fue resuelta en otra sesión' }
  }

  // Candado 2: tomar la unidad. Si otra sugerencia de la MISMA unidad ganó
  // primero (o el flujo manual se adelantó), el update no matchea filas y
  // esta confirmación se revierte a rechazada.
  const { data: tomada, error: errAsig } = await adminClient
    .from('compra_items')
    .update({
      destino:            'pedido',
      pedido_id:          asig.pedido_id,
      pedido_item_indice: lista.length > 1 ? indiceMatch : null,
    })
    .eq('id', asig.compra_item_id)
    .is('pedido_id', null)
    .eq('destino', 'sin_asignar')
    .select('id')
  if (errAsig || !tomada || tomada.length === 0) {
    await adminClient
      .from('asignaciones_pendientes')
      .update({ estado: 'rechazada' })
      .eq('id', asignacionId)
    revalidatePath('/compras')
    return {
      ok: false,
      error: errAsig
        ? `No se pudo asignar la compra: ${errAsig.message}`
        : 'Esa unidad de compra ya fue asignada por otro lado — la sugerencia quedó descartada',
    }
  }

  // Si la unidad ya había ENTRADO al stock (la compra llegó), sale ahora.
  // Con pedido_id NULL a propósito: el costo del pedido ya lo aporta
  // compra_items.pedido_id en vista_ganancia_pedidos, y una salida con
  // pedido_id lo sumaría por segunda vez (ver _sincronizarStockCompraItem).
  const { data: movs } = await adminClient
    .from('movimientos_inventario')
    .select('delta, sede_id, articulo_id')
    .eq('compra_item_id', asig.compra_item_id)
  const listaMovs = (movs ?? []) as Array<{ delta: number; sede_id: string | null; articulo_id: string | null }>
  const neto = listaMovs.reduce((s, m) => s + m.delta, 0)
  const articuloStock = item.articulo_id ?? listaMovs.find(m => m.articulo_id)?.articulo_id ?? null
  if (neto > 0 && articuloStock) {
    await adminClient.from('movimientos_inventario').insert({
      articulo_id:        articuloStock,
      talla:              item.talla || null,
      sede_id:            listaMovs.find(m => m.sede_id)?.sede_id ?? null,
      delta:              -neto,
      tipo:               'salida',
      compra_item_id:     asig.compra_item_id,
      pedido_id:          null,
      costo_unitario_cop: item.costo_unitario_cop,
      usuario_id:         userId,
      notas:              `Sale del stock: compra asignada al pedido ${pedido.numero_orden} (confirmada)`,
    })
  }

  const compra = (Array.isArray(item.compras) ? item.compras[0] : item.compras) as any

  // Estado del pedido: al confirmar pasa a 'comprado'; si la mercancía de esa
  // factura ya llegó, sigue a 'bucaramanga' (mismo RPC del flujo de llegada).
  if (pedido.estado === 'pendiente') {
    await adminClient
      .from('pedidos')
      .update({ estado: 'comprado', fecha_actualizacion: ahora })
      .eq('id', asig.pedido_id)
      .eq('estado', 'pendiente')
  }
  if (compra?.llegada_en) {
    const { data: pAct } = await adminClient
      .from('pedidos').select('estado').eq('id', asig.pedido_id).maybeSingle()
    if (pAct && ['pendiente', 'comprado', 'usa'].includes(pAct.estado)) {
      const { error: errRpc } = await supabase.rpc('cambiar_estado_pedido', {
        p_pedido_id:    asig.pedido_id,
        p_nuevo_estado: 'bucaramanga',
        p_usuario_id:   userId,
      })
      if (errRpc) console.error('Confirmación: no se pudo pasar el pedido a bucaramanga:', errRpc)
    }
  }

  // Constancia en el pedido de qué factura cubre el artículo.
  const detalle = `${item.marca ?? ''} ${item.descripcion}${talla ? ` T${talla}` : ''} → factura ${compra?.numero_factura ?? 's/n'} (${compra?.proveedor ?? '¿?'})`.trim()
  const nota = `✓ Compra confirmada: ${detalle}`
  await adminClient
    .from('pedidos')
    .update({ notas: pedido.notas ? `${pedido.notas}\n${nota}` : nota })
    .eq('id', asig.pedido_id)

  // Las demás sugerencias que apuntaban a esta misma unidad ya no aplican.
  await adminClient
    .from('asignaciones_pendientes')
    .update({ estado: 'rechazada', resuelto_en: ahora, resuelto_por: userId })
    .eq('compra_item_id', asig.compra_item_id)
    .eq('estado', 'pendiente')
    .neq('id', asignacionId)

  revalidatePath('/compras')
  revalidatePath('/pedidos')
  revalidatePath('/inventario')
  return { ok: true, mensaje: `Compra asignada al pedido ${pedido.numero_orden}` }
}

export async function rechazarAsignacionAction(asignacionId: string): Promise<ResolverAsignacionResult> {
  const { userId, adminClient } = await verificarAdmin()

  const { data: resuelta } = await adminClient
    .from('asignaciones_pendientes')
    .update({ estado: 'rechazada', resuelto_en: new Date().toISOString(), resuelto_por: userId })
    .eq('id', asignacionId)
    .eq('estado', 'pendiente')
    .select('id')
  if (!resuelta || resuelta.length === 0) {
    return { ok: false, error: 'Esta sugerencia ya fue resuelta' }
  }

  revalidatePath('/compras')
  return { ok: true, mensaje: 'Sugerencia descartada' }
}
