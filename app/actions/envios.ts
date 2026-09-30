'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeVerPedido } from '@/lib/auth/acceso'
import { prendasDePedido, type PrendaPedido } from '@/lib/pedidos/prendas'

// ─── Buscar pedido para el envío (por número escaneado/digitado) ─────────────

export type PedidoEnvio = {
  id: string
  numero_orden: string
  cliente_nombre: string
  estado: string
}

export async function buscarPedidoParaEnvioAction(
  numero: string
): Promise<{ ok: true; pedido: PedidoEnvio; itemIdx: number | null } | { ok: false; error: string }> {
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
  // Cuando se recorta, se guarda el índice (0-base) para avanzar solo esa prenda.
  let itemIdx: number | null = null
  if (!data && /-\d+$/.test(num)) {
    const base = num.replace(/-\d+$/, '')
    const r = await supabase
      .from('vista_pedidos_asesor')
      .select('id, numero_orden, cliente_nombre, estado, sede_id')
      .eq('numero_orden', base)
      .maybeSingle()
    if (r.data) {
      const match = num.match(/-(\d+)$/)
      if (match) itemIdx = parseInt(match[1]) - 1  // UI usa 1-base, internamente 0-base
    }
    data = r.data
  }

  if (!data) return { ok: false, error: `No existe el pedido ${num}` }
  // Logística entre sedes: un asesor de TR despacha pedidos de SR/CR también.
  if (!puedeVerPedido(sesion, (data as any).sede_id)) return { ok: false, error: `Sin acceso al pedido ${num}` }
  if ((data as any).estado === 'cancelado') return { ok: false, error: `El pedido ${num} está cancelado` }

  const p = data as any
  return { ok: true, pedido: { id: p.id, numero_orden: p.numero_orden, cliente_nombre: p.cliente_nombre, estado: p.estado }, itemIdx }
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
  | { tipo: 'pedido'; pedido_id: string; numero_orden: string; descripcion: string; item_idx?: number | null }
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

  // Prendas de cada pedido del envío (por id, como las etiquetas -1, -2…).
  const prendasCache = new Map<string, PrendaPedido[]>()
  const prendasDe = async (pedidoId: string) => {
    let lista = prendasCache.get(pedidoId)
    if (!lista) {
      lista = await prendasDePedido(supabase, pedidoId).catch(() => [] as PrendaPedido[])
      prendasCache.set(pedidoId, lista)
    }
    return lista
  }

  // Cada renglón de pedido guarda qué prenda viaja (etiqueta TR7900-2 → prenda
  // 2); sin prenda, viaja el pedido completo.
  const filas: Array<Record<string, unknown>> = []
  for (const it of data.items) {
    if (it.tipo === 'pedido') {
      let pedidoItemId: string | null = null
      if (it.item_idx != null) {
        const prendas = await prendasDe(it.pedido_id)
        if (prendas.length > 1) pedidoItemId = prendas[it.item_idx]?.id ?? null
      }
      filas.push({ envio_id: envio.id, pedido_id: it.pedido_id, pedido_item_id: pedidoItemId, numero_orden: it.numero_orden, descripcion: it.descripcion, cantidad: 1 })
    } else {
      filas.push({ envio_id: envio.id, codigo: it.codigo, talla: it.talla, cantidad: it.cantidad, descripcion: it.descripcion })
    }
  }

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

  // Destino Santa Rosa: lo que viaja pasa a 'santa_rosa' de una vez (mig. 205).
  //   · Renglón de una prenda (etiqueta TR7900-2): solo esa prenda; el pedido
  //     queda en el estado de su prenda más atrasada.
  //   · Renglón del pedido completo (TR7900): todas sus prendas.
  const renglonesPedido = filas.filter(f => f.pedido_id) as Array<{ pedido_id: string; pedido_item_id: string | null }>
  if (renglonesPedido.length > 0) {
    const { data: sedeDestino } = await supabase
      .from('sedes')
      .select('codigo')
      .eq('id', data.destino_sede_id)
      .maybeSingle()

    if ((sedeDestino as { codigo?: string } | null)?.codigo === 'SR') {
      await _avanzarSantaRosa(supabase, renglonesPedido, sesion.id)
      revalidatePath('/pedidos')
      revalidatePath('/pedidos/galeria')
    }
  }

  return { ok: true, envioId: envio.id }
}

const AVANZABLES_SR = ['pendiente', 'comprado', 'usa', 'bucaramanga']

// Avanza a 'santa_rosa' lo que viajó: por prenda cuando el renglón la trae,
// el pedido completo cuando no. Devuelve lo que no se pudo mover.
async function _avanzarSantaRosa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  renglones: Array<{ pedido_id: string; pedido_item_id: string | null }>,
  usuarioId: string,
): Promise<{ marcados: number; omitidos: string[] }> {
  const porPedido = new Map<string, { completo: boolean; prendas: Set<string> }>()
  for (const r of renglones) {
    const g = porPedido.get(r.pedido_id) ?? { completo: false, prendas: new Set<string>() }
    if (r.pedido_item_id) g.prendas.add(r.pedido_item_id)
    else g.completo = true
    porPedido.set(r.pedido_id, g)
  }

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado')
    .in('id', [...porPedido.keys()])

  let marcados = 0
  const omitidos: string[] = []
  for (const p of (pedidos ?? []) as Array<{ id: string; numero_orden: string; estado: string }>) {
    const g = porPedido.get(p.id)!
    if (g.completo) {
      if (!AVANZABLES_SR.includes(p.estado)) { if (p.estado !== 'santa_rosa') omitidos.push(`${p.numero_orden} (${p.estado})`); continue }
      const { error } = await supabase.rpc('cambiar_estado_pedido', {
        p_pedido_id: p.id, p_nuevo_estado: 'santa_rosa', p_usuario_id: usuarioId,
      })
      if (error) omitidos.push(`${p.numero_orden} (${error.message})`)
      else marcados++
      continue
    }
    const prendas = await prendasDePedido(supabase, p.id).catch(() => [] as PrendaPedido[])
    const aMover = prendas.filter(pr => g.prendas.has(pr.id) && AVANZABLES_SR.includes(pr.estado)).map(pr => pr.id)
    if (aMover.length === 0) continue
    const { error } = await supabase.rpc('cambiar_estado_prendas', {
      p_pedido_id: p.id, p_item_ids: aMover, p_nuevo_estado: 'santa_rosa', p_usuario_id: usuarioId,
    })
    if (error) omitidos.push(`${p.numero_orden} (${error.message})`)
    else marcados += aMover.length
  }
  return { marcados, omitidos }
}

// ─── Marcar lo del envío como llegado a Santa Rosa ───────────────────────────
// Por renglón del envío: la prenda que viajó, o el pedido completo. Solo
// avanza (con historial) lo que sigue en camino.

export type MarcarSantaRosaResult =
  | { ok: true; marcados: number; omitidos: string[] }
  | { ok: false; error: string }

export async function marcarEnvioSantaRosaAction(envioId: string): Promise<MarcarSantaRosaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para cambiar estados' }
  const supabase = await createClient()

  const { data: renglones, error } = await supabase
    .from('envio_items')
    .select('pedido_id, pedido_item_id, pedidos(sede_id, numero_orden)')
    .eq('envio_id', envioId)
    .not('pedido_id', 'is', null)
  if (error) return { ok: false, error: error.message }

  const omitidos: string[] = []
  const permitidos: Array<{ pedido_id: string; pedido_item_id: string | null }> = []
  for (const r of (renglones ?? []) as Array<{ pedido_id: string; pedido_item_id: string | null; pedidos: { sede_id: string; numero_orden: string } | { sede_id: string; numero_orden: string }[] | null }>) {
    const ped = Array.isArray(r.pedidos) ? r.pedidos[0] : r.pedidos
    // Avance logístico (solo hacia adelante, auditado): permitido entre sedes.
    if (!ped || !puedeVerPedido(sesion, ped.sede_id)) { omitidos.push(ped?.numero_orden ?? r.pedido_id); continue }
    permitidos.push({ pedido_id: r.pedido_id, pedido_item_id: r.pedido_item_id })
  }
  if (permitidos.length === 0 && omitidos.length === 0) return { ok: false, error: 'El envío no tiene pedidos' }

  const r = await _avanzarSantaRosa(supabase, permitidos, sesion.id)
  revalidatePath('/pedidos')
  revalidatePath('/pedidos/galeria')
  revalidatePath(`/envios/${envioId}`)
  return { ok: true, marcados: r.marcados, omitidos: [...omitidos, ...r.omitidos] }
}
