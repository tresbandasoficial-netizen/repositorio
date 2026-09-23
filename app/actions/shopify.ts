'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { shopifyAdminGraphQL, shopifyConfigurado } from '@/lib/shopify'

// ─── Pedido por Link (Shopify) ───────────────────────────────────────────────
// Flujo ADITIVO para clientes nuevos: la asesora genera un link de borrador
// de Shopify con el producto/precio del pedido ya montados; el cliente llena
// SUS datos en el checkout y el webhook los trae de vuelta (route.ts).
// El flujo normal de toma de pedidos no cambia en nada.

export type LinkCliente = {
  url: string
  draftName: string | null
  estado: 'pendiente' | 'confirmado'
  shopifyOrderName: string | null
  confirmadoEn: string | null
}

export type GenerarLinkResult =
  | { ok: true; link: LinkCliente }
  | { ok: false; error: string }

export async function generarLinkClienteAction(pedidoId: string): Promise<GenerarLinkResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }

  const supabase = await createClient()
  const { data: pedido, error: errPed } = await supabase
    .from('pedidos')
    .select('id, numero_orden, sede_id, estado, total')
    .eq('id', pedidoId)
    .maybeSingle()
  if (errPed) return { ok: false, error: errPed.message }
  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }
  if (!puedeAccederSede(sesion, pedido.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (pedido.estado === 'cancelado') return { ok: false, error: 'El pedido está cancelado' }

  const adminClient = createAdminClient()

  // Idempotente: si ya hay un link pendiente, se devuelve el mismo (repetir el
  // clic o el doble clic no crea borradores duplicados en Shopify).
  const { data: existente, error: errExist } = await adminClient
    .from('shopify_links')
    .select('invoice_url, draft_name, estado, shopify_order_name, confirmado_en')
    .eq('pedido_id', pedidoId)
    .eq('estado', 'pendiente')
    .maybeSingle()
  if (errExist) return { ok: false, error: errExist.message }
  if (existente) {
    return {
      ok: true,
      link: {
        url: existente.invoice_url,
        draftName: existente.draft_name,
        estado: 'pendiente',
        shopifyOrderName: null,
        confirmadoEn: null,
      },
    }
  }

  if (!shopifyConfigurado()) {
    return { ok: false, error: 'Falta configurar Shopify: pega SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET en Vercel (Settings → Environment Variables) y redespliega.' }
  }

  // Los artículos del pedido van como items del borrador, con el precio FIJO.
  const { data: items, error: errItems } = await supabase
    .from('pedido_items')
    .select('marca, descripcion, talla, cantidad, precio_venta')
    .eq('pedido_id', pedidoId)
    .order('id')
  if (errItems) return { ok: false, error: errItems.message }
  if (!items || items.length === 0) return { ok: false, error: 'El pedido no tiene artículos' }

  const lineItems = items.map(it => ({
    title: [it.marca, it.descripcion, it.talla ? `· Talla ${String(it.talla).trim().toUpperCase()}` : '']
      .filter(Boolean).join(' ').trim().slice(0, 255),
    quantity: Math.max(1, it.cantidad ?? 1),
    requiresShipping: true,
    originalUnitPriceWithCurrency: { amount: String(it.precio_venta ?? 0), currencyCode: 'COP' },
  }))

  // La IDENTIDAD del link es un UUID nuestro que viaja como tag del borrador
  // (tb:<uuid> — los tags de Shopify admiten máximo 40 caracteres). El webhook
  // resuelve por ese UUID — no por el número de pedido, que puede cambiar
  // (separar/editar) — y como es inadivinable, una orden ajena con tags
  // inventados no puede confirmar un link que no es suyo.
  const linkId = crypto.randomUUID()

  const r = await shopifyAdminGraphQL(
    `mutation CrearBorrador($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`,
    {
      input: {
        note: `Pedido ${pedido.numero_orden} — Tres Bandas (datos del cliente por link)`,
        tags: [pedido.numero_orden, 'tres-bandas-link', `tb:${linkId}`],
        lineItems,
      },
    },
  )
  if (!r.ok) return { ok: false, error: r.error }

  const payload = r.data?.draftOrderCreate
  const errores = (payload?.userErrors ?? []) as Array<{ message?: string }>
  if (errores.length > 0) {
    return { ok: false, error: `Shopify rechazó el borrador: ${errores.map(e => e.message).join('; ')}` }
  }
  const draft = payload?.draftOrder
  if (!draft?.invoiceUrl || !draft?.id) return { ok: false, error: 'Shopify no devolvió el link del borrador' }

  const { error: errIns } = await adminClient.from('shopify_links').insert({
    id: linkId,
    pedido_id: pedidoId,
    draft_id: draft.id,
    draft_name: draft.name ?? null,
    invoice_url: draft.invoiceUrl,
    estado: 'pendiente',
    creado_por: sesion.id,
  })
  if (errIns) {
    // El borrador recién creado queda huérfano (sin fila): se BORRA de Shopify
    // para que no quede un checkout cobrable suelto. Mejor esfuerzo — si el
    // delete falla, el webhook igual lo ignorará (su UUID no tiene fila).
    await shopifyAdminGraphQL(
      `mutation Borrar($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) { deletedId userErrors { field message } }
      }`,
      { input: { id: draft.id } },
    )
    // Carrera del doble clic: otro request ya guardó su link pendiente — usarlo.
    const { data: ganador } = await adminClient
      .from('shopify_links')
      .select('invoice_url, draft_name')
      .eq('pedido_id', pedidoId)
      .eq('estado', 'pendiente')
      .maybeSingle()
    if (ganador) {
      return { ok: true, link: { url: ganador.invoice_url, draftName: ganador.draft_name, estado: 'pendiente', shopifyOrderName: null, confirmadoEn: null } }
    }
    return { ok: false, error: `No se pudo guardar el vínculo: ${errIns.message}` }
  }

  revalidatePath(`/pedidos/${pedidoId}`)
  return {
    ok: true,
    link: { url: draft.invoiceUrl, draftName: draft.name ?? null, estado: 'pendiente', shopifyOrderName: null, confirmadoEn: null },
  }
}
