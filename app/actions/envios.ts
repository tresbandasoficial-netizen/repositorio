'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeVerPedido } from '@/lib/auth/acceso'

// ─── Buscar pedido para el envío (por número escaneado/digitado) ─────────────

export type PedidoEnvio = {
  id: string
  numero_orden: string
  cliente_nombre: string
  estado: string
}

export async function buscarPedidoParaEnvioAction(
  numero: string
): Promise<{ ok: true; pedido: PedidoEnvio } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  const supabase = await createClient()

  const num = numero.trim().toUpperCase()
  if (!num) return { ok: false, error: 'Número vacío' }

  let { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, cliente_nombre, estado, sede_id')
    .eq('numero_orden', num)
    .maybeSingle()

  // Convención del sufijo -N: puede ser un pedido real (separado, ej TR6835-2)
  // o la etiqueta del "artículo N" de un pedido de varias unidades (SR7081-1).
  // SIEMPRE número exacto primero; si no existe, se recorta el sufijo y se
  // busca el pedido base — así el escáner de etiquetas por unidad funciona.
  if (!data && /-\d+$/.test(num)) {
    const base = num.replace(/-\d+$/, '')
    const r = await supabase
      .from('vista_pedidos_asesor')
      .select('id, numero_orden, cliente_nombre, estado, sede_id')
      .eq('numero_orden', base)
      .maybeSingle()
    data = r.data
  }

  if (!data) return { ok: false, error: `No existe el pedido ${num}` }
  // Logística entre sedes: un asesor de TR despacha pedidos de SR/CR también.
  if (!puedeVerPedido(sesion, (data as any).sede_id)) return { ok: false, error: `Sin acceso al pedido ${num}` }
  if ((data as any).estado === 'cancelado') return { ok: false, error: `El pedido ${num} está cancelado` }

  const p = data as any
  return { ok: true, pedido: { id: p.id, numero_orden: p.numero_orden, cliente_nombre: p.cliente_nombre, estado: p.estado } }
}

// ─── Buscar artículo del catálogo (por código) ───────────────────────────────

export type ArticuloEnvio = {
  codigo: string
  descripcion: string   // marca + nombre del catálogo
  encontrado: boolean
}

export async function buscarArticuloParaEnvioAction(
  codigo: string
): Promise<ArticuloEnvio> {
  const supabase = await createClient()
  const cod = codigo.trim().toUpperCase()

  const { data } = await supabase
    .from('articulos')
    .select('codigo, marca, nombre')
    .ilike('codigo', cod)
    .maybeSingle()

  if (data) {
    const a = data as any
    return { codigo: a.codigo, descripcion: `${a.marca} ${a.nombre}`.trim(), encontrado: true }
  }
  // No está en el catálogo: se permite igual, como texto libre.
  return { codigo: cod, descripcion: '', encontrado: false }
}

// ─── Crear envío ──────────────────────────────────────────────────────────────

export type ItemEnvioInput =
  | { tipo: 'pedido'; pedido_id: string; numero_orden: string; descripcion: string }
  | { tipo: 'articulo'; codigo: string; talla: string | null; cantidad: number; descripcion: string | null }

export type CrearEnvioResult =
  | { ok: true; envioId: string }
  | { ok: false; error: string }

export async function crearEnvioAction(data: {
  destino_sede_id: string
  notas: string
  items: ItemEnvioInput[]
}): Promise<CrearEnvioResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para crear envíos' }
  if (data.items.length === 0) return { ok: false, error: 'El envío está vacío' }
  const supabase = await createClient()

  const { data: envio, error: errEnvio } = await supabase
    .from('envios')
    .insert({
      destino_sede_id: data.destino_sede_id,
      origen_sede_id:  sesion.sede_id ?? null,
      notas:           data.notas.trim() || null,
      creado_por:      sesion.id,
    })
    .select('id')
    .single()

  if (errEnvio || !envio) return { ok: false, error: `Error creando el envío: ${errEnvio?.message}` }

  const filas = data.items.map(it => it.tipo === 'pedido'
    ? { envio_id: envio.id, pedido_id: it.pedido_id, numero_orden: it.numero_orden, descripcion: it.descripcion, cantidad: 1 }
    : { envio_id: envio.id, codigo: it.codigo, talla: it.talla, cantidad: it.cantidad, descripcion: it.descripcion })

  const { error: errItems } = await supabase.from('envio_items').insert(filas)
  if (errItems) {
    // No dejar el envío vacío huérfano
    await supabase.from('envios').delete().eq('id', envio.id)
    return { ok: false, error: `Error guardando los ítems: ${errItems.message}` }
  }

  revalidatePath('/envios')
  return { ok: true, envioId: envio.id }
}

// ─── Marcar los pedidos del envío como llegados a Santa Rosa ─────────────────
// (mismo espíritu que marcarLlegadaBucaramangaAction: solo avanza, con historial)

export type MarcarSantaRosaResult =
  | { ok: true; marcados: number; omitidos: string[] }
  | { ok: false; error: string }

export async function marcarPedidosSantaRosaAction(
  pedidoIds: string[]
): Promise<MarcarSantaRosaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para cambiar estados' }
  if (pedidoIds.length === 0) return { ok: false, error: 'Sin pedidos' }
  const supabase = await createClient()

  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, estado, sede_id')
    .in('id', pedidoIds)

  const pedidos = (data ?? []) as Array<{ id: string; numero_orden: string; estado: string; sede_id: string }>
  const AVANZABLES = ['pendiente', 'comprado', 'usa', 'bucaramanga']

  let marcados = 0
  const omitidos: string[] = []
  for (const p of pedidos) {
    // Avance logístico (solo hacia adelante, auditado): permitido entre sedes.
    if (!puedeVerPedido(sesion, p.sede_id)) { omitidos.push(p.numero_orden); continue }
    if (p.estado === 'santa_rosa') continue // ya está
    if (!AVANZABLES.includes(p.estado)) { omitidos.push(`${p.numero_orden} (${p.estado})`); continue }
    const { error } = await supabase.rpc('cambiar_estado_pedido', {
      p_pedido_id:    p.id,
      p_nuevo_estado: 'santa_rosa',
      p_usuario_id:   sesion.id,
    })
    if (error) omitidos.push(`${p.numero_orden} (${error.message})`)
    else marcados++
  }

  revalidatePath('/pedidos')
  return { ok: true, marcados, omitidos }
}
