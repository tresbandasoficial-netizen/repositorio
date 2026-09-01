'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeVerPedido } from '@/lib/auth/acceso'

// ─── Buscar pedido para el envío (por número escaneado/digitado) ─────────────

export type PedidoEnvioItem = {
  marca: string | null
  descripcion: string | null
  talla: string | null
}

export type PedidoEnvio = {
  id: string
  numero_orden: string
  cliente_nombre: string
  estado: string
  // Artículos del pedido, para que el envío pueda llevarlos POR SEPARADO
  // (a veces no llegan todos a tiempo y viajan en remisiones distintas).
  items: PedidoEnvioItem[]
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

  // Los artículos del pedido, en el mismo orden estable (por id) que usa el
  // resto del sistema para la convención del sufijo -N.
  const { data: itemsRaw } = await supabase
    .from('pedido_items')
    .select('marca, descripcion, talla')
    .eq('pedido_id', p.id)
    .order('id')

  const items: PedidoEnvioItem[] = ((itemsRaw ?? []) as Array<{ marca: string | null; descripcion: string | null; talla: string | null }>).map(it => ({
    marca: it.marca ?? null,
    descripcion: it.descripcion ?? null,
    talla: it.talla ?? null,
  }))

  return { ok: true, pedido: { id: p.id, numero_orden: p.numero_orden, cliente_nombre: p.cliente_nombre, estado: p.estado, items } }
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
    .select('id, consecutivo')
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

  // Traslado de inventario: los ARTÍCULOS SUELTOS salen del stock de la sede
  // origen (Bucaramanga) y entran al de la sede destino, para que el stock
  // refleje dónde está la mercancía. Los pedidos no tocan inventario: su
  // mercancía viene de compras asignadas, nunca estuvo en stock.
  const articulos = data.items.filter(it => it.tipo === 'articulo') as Array<Extract<ItemEnvioInput, { tipo: 'articulo' }>>
  if (articulos.length > 0) {
    const admin = createAdminClient()

    let origenSedeId = sesion.sede_id
    if (!origenSedeId) {
      const { data: tr } = await admin.from('sedes').select('id').eq('codigo', 'TR').maybeSingle()
      origenSedeId = tr?.id ?? null
    }

    const sinDescontar: string[] = []
    for (const it of articulos) {
      const { data: art } = await admin
        .from('articulos')
        .select('id')
        .ilike('codigo', it.codigo.trim())
        .maybeSingle()
      // Código escrito a mano que no está en el catálogo: viaja en la remisión
      // pero no hay ficha de dónde descontar stock.
      if (!art || !origenSedeId) { sinDescontar.push(it.codigo); continue }

      const base = {
        articulo_id: art.id,
        talla:       it.talla || null,
        usuario_id:  sesion.id,
        notas:       `Envío #${envio.consecutivo}`,
      }
      const { error: errMov } = await admin.from('movimientos_inventario').insert([
        { ...base, sede_id: origenSedeId,        delta: -it.cantidad, tipo: 'salida' },
        { ...base, sede_id: data.destino_sede_id, delta: it.cantidad,  tipo: 'entrada' },
      ])
      if (errMov) sinDescontar.push(it.codigo)
    }

    // Que quede visible en la remisión si algo no se pudo mover de stock.
    if (sinDescontar.length > 0) {
      const aviso = `⚠ Sin traslado de stock (no están en el catálogo): ${sinDescontar.join(', ')}`
      await admin
        .from('envios')
        .update({ notas: data.notas.trim() ? `${data.notas.trim()}\n${aviso}` : aviso })
        .eq('id', envio.id)
    }
  }

  revalidatePath('/envios')
  revalidatePath('/inventario')
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

  // Cobertura de envíos: el estado 'santa_rosa' significa que el pedido
  // COMPLETO está en la sede. Un pedido partido en filas por artículo
  // (TR6835-1, TR6835-2 en envíos distintos) solo avanza cuando ya viajaron
  // TODOS sus artículos a Santa Rosa; mientras tanto se reporta como parcial
  // y queda "en camino" para marcarlo con el envío que traiga el resto.
  const numeroRealDe = new Map(pedidos.map(p => [p.id, p.numero_orden]))
  const ids = pedidos.map(p => p.id)
  const [{ data: itemsPed }, { data: filasEnvio }] = await Promise.all([
    supabase.from('pedido_items').select('pedido_id').in('pedido_id', ids),
    supabase
      .from('envio_items')
      .select('pedido_id, numero_orden, envio:envios!inner(destino:sedes!envios_destino_sede_id_fkey(codigo))')
      .in('pedido_id', ids),
  ])
  const totalArticulos = new Map<string, number>()
  for (const it of (itemsPed ?? []) as Array<{ pedido_id: string }>) {
    totalArticulos.set(it.pedido_id, (totalArticulos.get(it.pedido_id) ?? 0) + 1)
  }
  const articulosEnviados = new Map<string, Set<number>>() // índices -N que ya viajaron
  const viajoCompleto = new Set<string>()                   // fila del pedido entero
  for (const f of (filasEnvio ?? []) as unknown as Array<{ pedido_id: string; numero_orden: string | null; envio: { destino: { codigo: string } | null } | null }>) {
    if (f.envio?.destino?.codigo !== 'SR') continue
    const real = numeroRealDe.get(f.pedido_id)
    const num = f.numero_orden ?? ''
    const m = num.match(/-(\d+)$/)
    if (m && real && real.toUpperCase() !== num.toUpperCase()) {
      const set = articulosEnviados.get(f.pedido_id) ?? new Set<number>()
      set.add(parseInt(m[1], 10))
      articulosEnviados.set(f.pedido_id, set)
    } else {
      viajoCompleto.add(f.pedido_id)
    }
  }

  let marcados = 0
  const omitidos: string[] = []
  for (const p of pedidos) {
    // Avance logístico (solo hacia adelante, auditado): permitido entre sedes.
    if (!puedeVerPedido(sesion, p.sede_id)) { omitidos.push(p.numero_orden); continue }
    if (p.estado === 'santa_rosa') continue // ya está
    if (!AVANZABLES.includes(p.estado)) { omitidos.push(`${p.numero_orden} (${p.estado})`); continue }
    const total = totalArticulos.get(p.id) ?? 0
    if (total > 1 && !viajoCompleto.has(p.id)) {
      const enviados = articulosEnviados.get(p.id)?.size ?? 0
      if (enviados < total) {
        omitidos.push(`${p.numero_orden} (parcial: han viajado ${enviados} de ${total} artículos — se marca cuando llegue el resto)`)
        continue
      }
    }
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
