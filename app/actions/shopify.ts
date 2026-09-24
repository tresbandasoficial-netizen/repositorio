'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { shopifyAdminGraphQL, shopifyConfigurado } from '@/lib/shopify'
import { tallasDeCategoria } from '@/types'

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
        // Envío fijo en $0: sin esto el checkout aplica las tarifas de la
        // tienda (le sumaba "Envío estándar" al cliente) y el total del link
        // dejaba de ser el precio del pedido. Preseleccionado, el cliente no
        // puede cambiarlo; el envío se acuerda por WhatsApp como siempre.
        shippingLine: { title: 'Envío', priceWithCurrency: { amount: '0', currencyCode: 'COP' } },
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

// ─── Link para cliente NUEVO (sin pedido previo) ─────────────────────────────
// Cuando el cliente es totalmente nuevo no hay ni celular para crear el
// pedido. La asesora arma el link solo con los productos; el link guarda los
// renglones (mig. 201) y, cuando el cliente confirma en Shopify, el webhook
// crea el cliente y el pedido de una vez (RPC confirmar_link_nuevo).

export type ItemLinkNuevo = {
  articulo_id: string
  marca: string
  descripcion: string
  talla: string | null
  cantidad: number
  precio_venta: number
  imagen_url: string | null
  color: string | null
  sexo: string | null
  categoria: string | null
}

export type GenerarLinkNuevoResult =
  | { ok: true; url: string; draftName: string | null; linkId: string }
  | { ok: false; error: string }

const MAX_ITEMS_LINK = 20

export async function generarLinkNuevoAction(input: {
  sedeId: string
  notas: string | null
  items: ItemLinkNuevo[]
}): Promise<GenerarLinkNuevoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }

  const sedeId = typeof input?.sedeId === 'string' ? input.sedeId : ''
  if (!sedeId) return { ok: false, error: 'Falta la sede' }
  if (!puedeAccederSede(sesion, sedeId)) return { ok: false, error: 'No puedes generar links para otra sede' }

  const supabase = await createClient()
  const { data: sede, error: errSede } = await supabase
    .from('sedes')
    .select('id, codigo')
    .eq('id', sedeId)
    .maybeSingle()
  if (errSede) return { ok: false, error: errSede.message }
  if (!sede) return { ok: false, error: 'Sede no encontrada' }

  const items = Array.isArray(input?.items) ? input.items : []
  if (items.length === 0) return { ok: false, error: 'Agrega al menos un producto' }
  if (items.length > MAX_ITEMS_LINK) return { ok: false, error: `Máximo ${MAX_ITEMS_LINK} productos por link` }

  // Validación en el servidor (única fuente de verdad), fail-closed. Los
  // renglones se guardan para crear el pedido DESPUÉS (sin nadie mirando),
  // así que nombre, marca, categoría y sexo salen de la FICHA del catálogo —
  // no del request — y tienen que cumplir lo mismo que exige crear un pedido
  // a mano (si no, crear_pedido reventaría en el webhook y el pedido del
  // cliente se perdería).
  const idsPedidos = [...new Set(items.map(it => (typeof it?.articulo_id === 'string' ? it.articulo_id.trim() : '')).filter(Boolean))]
  if (idsPedidos.length === 0) return { ok: false, error: 'El producto 1 no está enlazado al catálogo: escribe el código y selecciónalo.' }
  const { data: fichas, error: errFichas } = await supabase
    .from('articulos')
    .select('id, codigo, nombre, marca, color, sexo, categoria')
    .in('id', idsPedidos)
  if (errFichas) return { ok: false, error: errFichas.message }
  type Ficha = { id: string; codigo: string | null; nombre: string | null; marca: string | null; color: string | null; sexo: string | null; categoria: string | null }
  const porId = new Map(((fichas ?? []) as Ficha[]).map(f => [f.id, f]))

  const CATEGORIAS = new Set(['ropa', 'tenis', 'accesorios'])
  const SEXOS = new Set(['hombre', 'mujer', 'nino'])
  const limpios: ItemLinkNuevo[] = []
  for (let i = 0; i < items.length; i++) {
    const it = (items[i] ?? {}) as Partial<ItemLinkNuevo>
    const quien = `El producto ${i + 1}`
    const articuloId = typeof it.articulo_id === 'string' ? it.articulo_id.trim() : ''
    if (!articuloId) return { ok: false, error: `${quien} no está enlazado al catálogo: escribe el código y selecciónalo.` }
    const f = porId.get(articuloId)
    if (!f) return { ok: false, error: `${quien} no existe en el catálogo.` }
    const descripcion = String(f.nombre ?? '').trim()
    const marca = String(f.marca ?? '').trim()
    if (!String(f.codigo ?? '').trim()) {
      return { ok: false, error: `"${descripcion || quien}" está enlazado a una ficha SIN código. Ponle el código en Inventario.` }
    }
    if (!descripcion) return { ok: false, error: `${quien}: la ficha del catálogo no tiene nombre.` }
    if (!marca) return { ok: false, error: `${quien}: la ficha del catálogo no tiene marca.` }
    const categoria = f.categoria ? String(f.categoria) : null
    const sexo = f.sexo ? String(f.sexo) : null
    if (!categoria || !CATEGORIAS.has(categoria)) {
      return { ok: false, error: `"${descripcion}" no dice si es ropa, tenis o accesorio. Complétalo en Inventario.` }
    }
    if (categoria !== 'accesorios' && (!sexo || !SEXOS.has(sexo))) {
      return { ok: false, error: `"${descripcion}" no dice si es de hombre, mujer o niño. Complétalo en Inventario.` }
    }
    const talla = it.talla ? String(it.talla).trim().toUpperCase().slice(0, 20) : null
    if (tallasDeCategoria(categoria as any, sexo as any).length > 0 && !talla) {
      return { ok: false, error: `${quien} necesita talla.` }
    }
    const cantidad = Number(it.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) return { ok: false, error: `${quien} tiene cantidad inválida.` }
    const precio = Number(it.precio_venta)
    if (!Number.isInteger(precio) || precio <= 0) return { ok: false, error: `${quien} no tiene precio de venta.` }
    const imagenUrl = typeof it.imagen_url === 'string' && /^https:\/\//.test(it.imagen_url) ? it.imagen_url.slice(0, 1000) : null
    // Misma regla que crear pedido a mano: para asesores la foto es obligatoria
    // (identifica qué se compró en etiquetas, compras y revisión de mercancía).
    if (sesion.rol === 'asesor' && !imagenUrl) {
      return { ok: false, error: `${quien} no tiene foto. Carga la imagen del producto antes de generar el link.` }
    }
    limpios.push({
      articulo_id: articuloId,
      marca,
      descripcion,
      talla: categoria === 'accesorios' ? null : talla,
      cantidad,
      precio_venta: precio,
      imagen_url: imagenUrl,
      color: f.color ? String(f.color).trim().slice(0, 100) : null,
      sexo,
      categoria,
    })
  }

  if (!shopifyConfigurado()) {
    return { ok: false, error: 'Falta configurar Shopify: pega SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET en Vercel (Settings → Environment Variables) y redespliega.' }
  }

  const total = limpios.reduce((s, it) => s + it.precio_venta * it.cantidad, 0)
  const lineItems = limpios.map(it => ({
    title: [it.marca, it.descripcion, it.talla ? `· Talla ${it.talla}` : ''].filter(Boolean).join(' ').trim().slice(0, 255),
    quantity: it.cantidad,
    requiresShipping: true,
    originalUnitPriceWithCurrency: { amount: String(it.precio_venta), currencyCode: 'COP' },
  }))
  const notas = (input?.notas ?? '').toString().trim().slice(0, 500) || null

  // Misma identidad que el link con pedido: tag tb:<uuid> (mig. 200).
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
        note: `Link para cliente nuevo — Tres Bandas (sede ${sede.codigo})`,
        tags: ['tres-bandas-link', 'link-nuevo', `tb:${linkId}`],
        lineItems,
        shippingLine: { title: 'Envío', priceWithCurrency: { amount: '0', currencyCode: 'COP' } },
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

  const adminClient = createAdminClient()
  const { error: errIns } = await adminClient.from('shopify_links').insert({
    id: linkId,
    pedido_id: null,
    sede_id: sede.id,
    items: limpios,
    total,
    notas,
    draft_id: draft.id,
    draft_name: draft.name ?? null,
    invoice_url: draft.invoiceUrl,
    estado: 'pendiente',
    creado_por: sesion.id,
  })
  if (errIns) {
    // Borrador huérfano (sin fila): se borra para no dejar un checkout suelto.
    // Mejor esfuerzo — si el delete falla, el webhook igual lo ignora (su
    // UUID no tiene fila).
    await shopifyAdminGraphQL(
      `mutation Borrar($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) { deletedId userErrors { field message } }
      }`,
      { input: { id: draft.id } },
    )
    return { ok: false, error: `No se pudo guardar el link: ${errIns.message}` }
  }

  revalidatePath('/pedidos/link-nuevo')
  return { ok: true, url: draft.invoiceUrl, draftName: draft.name ?? null, linkId }
}
