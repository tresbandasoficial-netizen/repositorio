'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

// Resuelve una referencia de pedido a su pedido REAL: primero por número
// exacto (los pedidos separados por artículo son pedidos de verdad llamados
// TR6835-1, TR6835-2…); si no existe, el sufijo se interpreta como
// "artículo N del pedido base" (comportamiento histórico de compras).
async function _resolverPedidoPorRef(
  client: ReturnType<typeof createAdminClient>,
  ref: string,
): Promise<{ id: string; estado: string; numero_orden: string; indice: number | null } | null> {
  const { data: exacto } = await client
    .from('pedidos').select('id, estado, numero_orden').eq('numero_orden', ref).maybeSingle()
  if (exacto) return { ...exacto, indice: null }

  const m = ref.match(/^(.+)-(\d+)$/)
  if (!m) return null
  const { data: base } = await client
    .from('pedidos').select('id, estado, numero_orden').eq('numero_orden', m[1]).maybeSingle()
  if (!base) return null
  return { ...base, indice: parseInt(m[2], 10) }
}

export type CompraItemInput = {
  codigo?: string               // código SKU extraído de la factura
  descripcion: string
  marca: string
  talla: string
  cantidad: number
  costo_unitario_cop: number
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  articulo_id?: string | null   // vínculo opcional al catálogo (para inventario)
  pedido_ref?: string           // "TR6492" o "TR6492-1" — asigna al pedido al crear
  // Ficha del artículo NUEVO (el formulario los pide cuando el código no está
  // en el catálogo, para que la ficha nazca completa)
  categoria?: string
  sexo?: string
  color?: string
}

export type PedidoItemBusqueda = {
  codigo: string
  descripcion: string
  marca: string
  talla: string
  articulo_id: string | null
  imagen_url: string | null   // la foto que se subió en el pedido, o la del catálogo
}

// Busca un pedido por número de orden (para el lookup en vivo del formulario).
// Devuelve también sus productos, para autollenar el artículo de la compra.
export async function buscarPedidoPorOrdenAction(numeroOrden: string): Promise<
  {
    id: string; numero_orden: string; estado: string; cliente_nombre: string | null
    items: PedidoItemBusqueda[]
    // Para evitar doble asignación: unidades del pedido vs. ya compradas
    unidades_pedido: number
    unidades_compradas: number
  } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Acepta "TR6492" o "TR6492-1". Primero busca el número EXACTO (los pedidos
  // separados por artículo son pedidos reales llamados TR6835-1, TR6835-2…);
  // si no existe, el sufijo se interpreta como "artículo N del pedido base".
  const ref = numeroOrden.trim().toUpperCase()
  if (!ref) return null

  let { data } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado, cliente_id')
    .eq('numero_orden', ref)
    .maybeSingle()

  if (!data) {
    const orden = ref.match(/^(.+)-(\d+)$/)?.[1]
    if (orden) {
      const res = await supabase
        .from('pedidos')
        .select('id, numero_orden, estado, cliente_id')
        .eq('numero_orden', orden)
        .maybeSingle()
      data = res.data
    }
  }
  if (!data) return null

  const [{ data: cli }, { data: itemsRaw }, { data: compraItems }] = await Promise.all([
    supabase.from('clientes').select('nombre').eq('id', data.cliente_id).maybeSingle(),
    supabase
      .from('pedido_items')
      .select('marca, descripcion, talla, cantidad, articulo_id, imagen_url, articulos(codigo, nombre, marca, fotos)')
      .eq('pedido_id', data.id)
      .order('id'),
    supabase.from('compra_items').select('cantidad').eq('pedido_id', data.id),
  ])

  const items: PedidoItemBusqueda[] = (itemsRaw ?? []).map((it: Record<string, unknown>) => {
    const art = Array.isArray(it.articulos) ? it.articulos[0] : it.articulos
    const cat = art as { codigo?: string; nombre?: string; marca?: string; fotos?: string[] } | null
    return {
      codigo:      cat?.codigo ?? '',
      // Si el artículo está en el catálogo, manda el NOMBRE OFICIAL del
      // catálogo (cada pedido puede tener la descripción escrita a su manera).
      descripcion: cat?.nombre || ((it.descripcion as string) ?? ''),
      marca:       cat?.marca || ((it.marca as string) ?? ''),
      talla:       (it.talla as string) ?? '',
      articulo_id: (it.articulo_id as string) ?? null,
      // Manda la foto DEL PEDIDO: es la que se le mostró al cliente. La del
      // catálogo queda de respaldo cuando el pedido no trae ninguna.
      imagen_url:  ((it.imagen_url as string) || cat?.fotos?.[0]) ?? null,
    }
  })

  const unidades_pedido = (itemsRaw ?? []).reduce((s: number, it: any) => s + (it.cantidad || 1), 0)
  const unidades_compradas = (compraItems ?? []).reduce((s: number, it: any) => s + (it.cantidad || 1), 0)

  return {
    id: data.id, numero_orden: data.numero_orden, estado: data.estado,
    cliente_nombre: cli?.nombre ?? null, items,
    unidades_pedido, unidades_compradas,
  }
}

export type CrearCompraInput = {
  tipo: 'usa' | 'colombia'
  proveedor: string
  fecha: string
  numero_factura: string
  total_usd: number | null
  trm: number | null
  total_cop: number
  notas: string
  correo?: string        // correo de la cuenta con que se compró (puntos adiClub etc.)
  cuenta_id: string | null
  items: CompraItemInput[]
}

export type CrearCompraResult =
  | { ok: true; compraId: string }
  | { ok: false; error: string }

export async function crearCompraAction(data: CrearCompraInput): Promise<CrearCompraResult> {
  const { userId, adminClient } = await verificarAdmin()

  if (!data.cuenta_id)
    return { ok: false, error: 'Selecciona la cuenta de pago: de dónde salió el dinero de esta compra' }

  const numeroFactura = data.numero_factura.trim() || null

  // Verificar duplicado por número de factura
  // El número de factura es obligatorio y único: es el candado contra
  // registrar la misma factura dos veces.
  if (!numeroFactura) {
    return { ok: false, error: 'El número de factura es obligatorio' }
  }
  {
    const { data: existente } = await adminClient
      .from('compras')
      .select('id, proveedor, fecha')
      .eq('numero_factura', numeroFactura)
      .maybeSingle()

    if (existente) {
      return {
        ok: false,
        error: `La factura "${numeroFactura}" ya fue registrada (${existente.proveedor} — ${existente.fecha})`,
      }
    }
  }

  // La suma de los productos debe cuadrar con el total de la factura. La única
  // tolerancia es el redondeo USD→COP: $50 por producto (mín $200); $1.000 de
  // diferencia ya es un dígito mal puesto y se bloquea.
  const sumaItems = data.items.reduce((s, it) => s + (it.costo_unitario_cop || 0) * (it.cantidad || 0), 0)
  const diferencia = Math.abs((data.total_cop || 0) - sumaItems)
  if (data.total_cop > 0 && sumaItems > 0 && diferencia > Math.max(200, data.items.length * 50)) {
    return {
      ok: false,
      error: `La suma de los productos ($${sumaItems.toLocaleString('es-CO')}) no cuadra con el total de la factura ($${data.total_cop.toLocaleString('es-CO')}) — diferencia de $${diferencia.toLocaleString('es-CO')}. Revisa los costos, las cantidades o si hay una fila repetida.`,
    }
  }

  // Evitar doble asignación: un pedido con su compra completa no puede recibir
  // otra (duplicaría el costo y la ganancia saldría mal).
  const unidadesPorRef = new Map<string, number>()
  for (const it of data.items) {
    if (it.destino === 'pedido' && it.pedido_ref?.trim()) {
      const ref = it.pedido_ref.trim().toUpperCase()
      unidadesPorRef.set(ref, (unidadesPorRef.get(ref) ?? 0) + (it.cantidad || 1))
    }
  }
  // Las refs se agrupan por el pedido REAL que resuelven (TR6835-2 puede ser
  // un pedido separado real, o el artículo 2 del pedido TR6835).
  const unidadesPorPedido = new Map<string, { numero: string; unidades: number }>()
  for (const [ref, unidades] of unidadesPorRef) {
    const ped = await _resolverPedidoPorRef(adminClient, ref)
    if (!ped) continue
    const acc = unidadesPorPedido.get(ped.id)
    unidadesPorPedido.set(ped.id, { numero: ped.numero_orden, unidades: (acc?.unidades ?? 0) + unidades })
  }
  for (const [pedidoId, { numero: numeroOrden, unidades: unidadesNuevas }] of unidadesPorPedido) {
    const [{ data: itemsPed }, { data: yaAsignados }] = await Promise.all([
      adminClient.from('pedido_items').select('cantidad').eq('pedido_id', pedidoId),
      adminClient.from('compra_items').select('cantidad').eq('pedido_id', pedidoId),
    ])
    const unidadesPedido = (itemsPed ?? []).reduce((s, r: any) => s + (r.cantidad || 1), 0)
    const unidadesCompradas = (yaAsignados ?? []).reduce((s, r: any) => s + (r.cantidad || 1), 0)
    if (unidadesCompradas >= unidadesPedido && unidadesPedido > 0) {
      return { ok: false, error: `El pedido ${numeroOrden} YA tiene su compra asignada completa (${unidadesCompradas} de ${unidadesPedido} unidades). No se puede asignar otra compra — se duplicaría el costo.` }
    }
    if (unidadesCompradas + unidadesNuevas > unidadesPedido && unidadesPedido > 0) {
      return { ok: false, error: `El pedido ${numeroOrden} quedaría con más compra que artículos (${unidadesCompradas + unidadesNuevas} de ${unidadesPedido} unidades). Revisa las filas asignadas a ese pedido.` }
    }
  }

  const { data: compra, error: errCompra } = await adminClient
    .from('compras')
    .insert({
      tipo: data.tipo,
      proveedor: data.proveedor.trim(),
      fecha: data.fecha,
      numero_factura: numeroFactura,
      total_usd: data.total_usd,
      trm: data.trm,
      total_cop: data.total_cop,
      notas: data.notas.trim() || null,
      correo: data.correo?.trim().toLowerCase() || null,
      cuenta_id: data.cuenta_id || null,
      creado_por: userId,
    })
    .select('id')
    .single()

  if (errCompra || !compra) {
    return { ok: false, error: `Error creando compra: ${errCompra?.message}` }
  }

  for (const item of data.items) {
    let articuloId = item.articulo_id || null

    // Artículo nuevo con código: la ficha del catálogo se crea AQUÍ, completa
    // (categoría, sexo y color vienen del formulario), y el item queda enlazado
    // de una vez. Antes la ficha se creaba a medias al asignar el pedido.
    if (!articuloId && item.codigo?.trim() && item.descripcion.trim()) {
      const cod = item.codigo.trim()
      const { data: existente } = await adminClient
        .from('articulos')
        .select('id')
        .ilike('codigo', cod)
        .maybeSingle()
      if (existente) {
        articuloId = existente.id
      } else {
        const { data: nuevoArt } = await adminClient
          .from('articulos')
          .insert({
            codigo:    cod,
            nombre:    item.descripcion.trim(),
            marca:     item.marca.trim() || 'Sin marca',
            categoria: item.categoria || null,
            sexo:      item.sexo || null,
            color:     item.color?.trim() || null,
          })
          .select('id')
          .maybeSingle()
        articuloId = nuevoArt?.id ?? null
      }
    }

    const { data: itemCreado, error: errItem } = await adminClient
      .from('compra_items')
      .insert({
        compra_id:          compra.id,
        codigo:             item.codigo?.trim() || null,
        descripcion:        item.descripcion.trim(),
        marca:              item.marca.trim() || null,
        talla:              item.talla.trim() || null,
        cantidad:           item.cantidad,
        costo_unitario_cop: item.costo_unitario_cop,
        destino:            item.destino,
        articulo_id:        articuloId,
      })
      .select('id')
      .single()

    if (errItem || !itemCreado) {
      return { ok: false, error: `Error creando item: ${errItem?.message}` }
    }

    // Asignación directa a pedido si viene el número (ej: "TR6492", "TR6492-1"
    // como artículo 1, o un pedido separado real llamado TR6492-1).
    if (item.destino === 'pedido' && item.pedido_ref?.trim()) {
      const pedido = await _resolverPedidoPorRef(adminClient, item.pedido_ref.trim().toUpperCase())

      if (pedido) {
        await adminClient.from('compra_items')
          .update({ pedido_id: pedido.id, pedido_item_indice: pedido.indice })
          .eq('id', itemCreado.id)
        // El pedido avanza de pendiente → comprado al asignarle la compra.
        if (pedido.estado === 'pendiente') {
          await adminClient.from('pedidos')
            .update({ estado: 'comprado', fecha_actualizacion: new Date().toISOString() })
            .eq('id', pedido.id)
        }
        // Vincular el artículo del catálogo si aplica.
        await _resolverArticuloCompraItem(itemCreado.id, pedido.id, pedido.indice, adminClient)
      }
    }

    // Regla de inventario: si el ítem NO está asignado a un pedido, entra al
    // stock de Bucaramanga (centro de distribución) con su costo de compra.
    // Si aún no está vinculado al catálogo se resuelve o se crea la ficha —
    // por código si lo trae, o por marca + nombre si no — para que todo
    // sobrante quede en stock valorado y se pueda asignar a un pedido después.
    if (item.destino === 'sin_asignar') {
      if (!articuloId) {
        await _resolverArticuloCompraItem(itemCreado.id, null, null, adminClient)
        const { data: itemAct } = await adminClient
          .from('compra_items').select('articulo_id').eq('id', itemCreado.id).single()
        articuloId = itemAct?.articulo_id ?? null
      }
      if (articuloId) {
        const { error: errInv } = await adminClient.rpc('registrar_entrada_inventario', {
          p_articulo_id:    articuloId,
          p_talla:          item.talla.trim() || null,
          p_cantidad:       item.cantidad,
          p_costo_unitario: item.costo_unitario_cop,
          p_usuario_id:     userId,
          p_compra_item_id: itemCreado.id,
          p_sede_id:        null,
          p_notas:          `Compra ${numeroFactura ?? ''} — ${data.proveedor}`.trim(),
        })
        if (errInv) {
          return { ok: false, error: `Error registrando inventario: ${errInv.message}` }
        }
      }
    }
  }

  // Crear gasto egreso si hay cuenta asignada (secundario: no debe romper la compra)
  try {
    await _sincronizarGastoCompra(
      compra.id, data.fecha, data.total_cop,
      data.proveedor.trim(), numeroFactura,
      data.cuenta_id || null, userId, adminClient
    )
  } catch (e) {
    console.error('Error sincronizando gasto de compra:', e)
  }

  return { ok: true as const, compraId: compra.id }
}

export type AsignarItemResult =
  | { ok: true; aviso?: string }
  | { ok: false; error: string }

// Avisa si lo comprado NO es lo que el pedido pide. No bloquea — a veces se
// cambia el modelo de común acuerdo con el cliente — pero deja de pasar en
// silencio: así se metió un "Cloudmonster 3" en un pedido que pedía
// "Cloudmonster 3 Hyper", y el pedido quedó marcado como comprado.
async function _avisoArticuloDistinto(
  itemId: string,
  pedidoId: string,
  indice: number | null,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<string | undefined> {
  const { data: compra } = await adminClient
    .from('compra_items')
    .select('articulo_id, articulos(codigo, nombre)')
    .eq('id', itemId)
    .maybeSingle()
  if (!compra?.articulo_id) return undefined

  const { data: itemsPedido } = await adminClient
    .from('pedido_items')
    .select('articulo_id, descripcion, articulos(codigo, nombre)')
    .eq('pedido_id', pedidoId)
    .order('id')
  if (!itemsPedido || itemsPedido.length === 0) return undefined

  // Con índice se compara contra ESE artículo; sin índice basta que alguno calce.
  const objetivo = indice != null ? itemsPedido[indice - 1] : null
  const calzaAlguno = itemsPedido.some(i => i.articulo_id === compra.articulo_id)
  if (indice == null ? calzaAlguno : objetivo?.articulo_id === compra.articulo_id) return undefined

  const nom = (x: any) => {
    const a = Array.isArray(x?.articulos) ? x.articulos[0] : x?.articulos
    return a?.codigo ? `${a.codigo} (${a.nombre})` : x?.descripcion ?? 'sin identificar'
  }
  const pedido = objetivo ?? itemsPedido[0]
  // Si el artículo del pedido está sin enlazar al catálogo no hay nada que
  // comparar: no se avisa para no gritar en falso.
  if (!pedido?.articulo_id) return undefined

  return `Lo comprado es ${nom(compra)} pero el pedido pide ${nom(pedido)}. `
    + `Se asignó igual — verifica si es un cambio de modelo acordado o una asignación equivocada.`
}

export async function asignarItemAction(
  itemId: string,
  destino: 'pedido' | 'contoda' | 'sin_asignar',
  pedidoRef?: string
): Promise<AsignarItemResult> {
  const { userId, adminClient } = await verificarAdmin()

  let pedidoId: string | null = null
  let pedidoItemIndice: number | null = null

  if (destino === 'pedido') {
    if (!pedidoRef?.trim()) {
      return { ok: false, error: 'Debes indicar el número de orden del pedido' }
    }

    const ref = pedidoRef.trim().toUpperCase()
    // "TR6835-1" puede ser un pedido separado real O el artículo 1 de TR6835:
    // el número exacto manda, el sufijo es el respaldo.
    const pedido = await _resolverPedidoPorRef(adminClient, ref)
    if (!pedido) {
      return { ok: false, error: `Pedido "${ref}" no encontrado` }
    }

    pedidoId = pedido.id
    pedidoItemIndice = pedido.indice

    if (pedido.estado === 'pendiente') {
      await adminClient
        .from('pedidos')
        .update({ estado: 'comprado', fecha_actualizacion: new Date().toISOString() })
        .eq('id', pedido.id)
    }
  }

  const { error } = await adminClient
    .from('compra_items')
    .update({
      destino,
      pedido_id: pedidoId,
      pedido_item_indice: pedidoItemIndice,
      transferido_contoda: destino === 'contoda',
      transferido_en: destino === 'contoda' ? new Date().toISOString() : null,
    })
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }

  // Auto-vincular artículo del catálogo si aún no está vinculado
  let aviso: string | undefined
  if (destino === 'pedido' && pedidoId) {
    await _resolverArticuloCompraItem(itemId, pedidoId, pedidoItemIndice, adminClient)
    aviso = await _avisoArticuloDistinto(itemId, pedidoId, pedidoItemIndice, adminClient)
  }

  // El stock de Bucaramanga sigue al destino: entra si queda sin asignar,
  // sale cuando se le asigna a un pedido o se va para Contoda.
  await _sincronizarStockCompraItem(itemId, destino, userId, adminClient)

  revalidatePath('/inventario')
  revalidatePath('/compras')
  revalidatePath('/pedidos/galeria')

  return { ok: true, aviso }
}

// Deja el stock de Bucaramanga acorde al destino del ítem, sin importar cuántas
// veces se reasigne:
//   destino 'sin_asignar'          → el ítem debe estar EN stock (neto = cantidad)
//   destino 'pedido' / 'contoda'   → el ítem sale del stock (neto = 0)
// Se calcula el neto de los movimientos que ya tiene y se inserta solo la
// diferencia, así que llamarla dos veces no duplica nada.
//
// El movimiento va con pedido_id NULL a propósito: el costo del pedido ya lo
// aporta compra_items.pedido_id en vista_ganancia_pedidos, y una salida con
// pedido_id lo sumaría por segunda vez.
async function _sincronizarStockCompraItem(
  itemId: string,
  destino: 'pedido' | 'contoda' | 'sin_asignar',
  usuarioId: string,
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  notasEntrada?: string,
) {
  const { data: item } = await adminClient
    .from('compra_items')
    .select('articulo_id, talla, cantidad, costo_unitario_cop')
    .eq('id', itemId)
    .single()

  if (!item) return

  let articuloId = item.articulo_id as string | null

  // Para entrar al stock hace falta un artículo del catálogo que lo valore.
  if (!articuloId && destino === 'sin_asignar') {
    await _resolverArticuloCompraItem(itemId, null, null, adminClient)
    const { data: act } = await adminClient
      .from('compra_items').select('articulo_id').eq('id', itemId).single()
    articuloId = act?.articulo_id ?? null
  }
  if (!articuloId) return

  const { data: movs } = await adminClient
    .from('movimientos_inventario')
    .select('delta')
    .eq('compra_item_id', itemId)

  const neto = (movs ?? []).reduce((s: number, m: { delta: number }) => s + m.delta, 0)
  const objetivo = destino === 'sin_asignar' ? item.cantidad : 0
  const ajuste = objetivo - neto
  if (ajuste === 0) return

  const { data: tr } = await adminClient
    .from('sedes').select('id').eq('codigo', 'TR').maybeSingle()

  await adminClient.from('movimientos_inventario').insert({
    articulo_id:        articuloId,
    talla:              item.talla || null,
    sede_id:            tr?.id ?? null,
    delta:              ajuste,
    tipo:               ajuste > 0 ? 'entrada' : 'salida',
    compra_item_id:     itemId,
    pedido_id:          null,
    costo_unitario_cop: item.costo_unitario_cop,
    usuario_id:         usuarioId,
    notas: ajuste > 0
      ? (notasEntrada || 'Vuelve al stock de Bucaramanga (compra sin asignar)')
      : `Sale del stock de Bucaramanga (compra asignada a ${destino === 'pedido' ? 'pedido' : 'Contoda'})`,
  })
}

async function _resolverArticuloCompraItem(
  itemId: string,
  pedidoId: string | null,
  pedidoItemIndice: number | null,
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
) {
  const { data: item } = await adminClient
    .from('compra_items')
    .select('articulo_id, codigo, descripcion, marca, talla')
    .eq('id', itemId)
    .single()

  if (!item || item.articulo_id) return  // ya está vinculado

  let articuloId: string | null = null

  // Prioridad 1: heredar articulo_id del pedido_item si se conoce el índice
  if (pedidoId && pedidoItemIndice !== null) {
    const { data: pedidoItems } = await adminClient
      .from('pedido_items')
      .select('id, articulo_id')
      .eq('pedido_id', pedidoId)
      .order('id')

    const pedidoItem = pedidoItems?.[pedidoItemIndice - 1]
    if (pedidoItem?.articulo_id) {
      articuloId = pedidoItem.articulo_id
    }
  }

  // Prioridad 2: buscar por código SKU en el catálogo
  if (!articuloId && item.codigo) {
    const { data: existente } = await adminClient
      .from('articulos')
      .select('id')
      .ilike('codigo', item.codigo.trim())
      .maybeSingle()

    if (existente) {
      articuloId = existente.id
    } else {
      // Crear el artículo automáticamente con los datos de la factura
      const { data: nuevo } = await adminClient
        .from('articulos')
        .insert({
          codigo:  item.codigo.trim(),
          nombre:  item.descripcion.trim(),
          marca:   item.marca?.trim() || 'Sin marca',
        })
        .select('id')
        .single()
      articuloId = nuevo?.id ?? null
    }
  }

  // Prioridad 3: sin código, por marca + nombre. Antes esto se dejaba sin
  // vincular y el sobrante NO entraba al stock de Bucaramanga; ahora se crea
  // la ficha (sin código, editable después en /inventario) para que entre.
  if (!articuloId && item.descripcion?.trim()) {
    const nombre = item.descripcion.trim()
    const marca  = item.marca?.trim() || 'Sin marca'

    const { data: existente } = await adminClient
      .from('articulos')
      .select('id')
      .ilike('marca', marca)
      .ilike('nombre', nombre)
      .limit(1)
      .maybeSingle()

    if (existente) {
      articuloId = existente.id
    } else {
      const { data: nuevo } = await adminClient
        .from('articulos')
        .insert({ nombre, marca })
        .select('id')
        .single()
      articuloId = nuevo?.id ?? null
    }
  }

  if (articuloId) {
    await adminClient
      .from('compra_items')
      .update({ articulo_id: articuloId })
      .eq('id', itemId)
  }
}

// Crea o actualiza el gasto asociado a una compra (egreso de la cuenta elegida).
// El gasto descuenta el saldo de esa cuenta en el flujo de caja.
async function _sincronizarGastoCompra(
  compraId: string,
  fecha: string,
  totalCop: number,
  proveedor: string,
  numeroFactura: string | null,
  cuentaId: string | null,
  userId: string,
  adminClient: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
) {
  // Borrar gasto previo de esta compra (si existía)
  await adminClient.from('gastos').delete().eq('origen', 'compra').eq('origen_id', compraId)

  if (!cuentaId) return  // sin cuenta → sin egreso

  // gastos.sede_id es obligatorio. Si la cuenta tiene sede, se usa; si es una
  // cuenta global (Nequi, Addi, Bancolombia Huber…), el egreso se atribuye a
  // Bucaramanga, que es el hub donde se gestionan las compras.
  const { data: cuenta } = await adminClient
    .from('cuentas').select('sede_id').eq('id', cuentaId).maybeSingle()

  let sedeId = cuenta?.sede_id ?? null
  if (!sedeId) {
    const { data: tr } = await adminClient
      .from('sedes').select('id').eq('codigo', 'TR').maybeSingle()
    sedeId = tr?.id ?? null
  }
  if (!sedeId) return  // sin ninguna sede disponible (no debería pasar)

  await adminClient.from('gastos').insert({
    fecha,
    valor: totalCop,
    categoria: 'compras_mercancia',
    sede_id: sedeId,
    cuenta_id: cuentaId,
    responsable_id: userId,
    origen: 'compra',
    origen_id: compraId,
    observacion: `Compra ${numeroFactura ? '#' + numeroFactura + ' — ' : ''}${proveedor}`.trim(),
  })
}

export type EditarCompraItemInput = CompraItemInput & { id?: string }

export type EditarCompraInput = {
  proveedor: string
  fecha: string
  numero_factura: string
  tipo: 'usa' | 'colombia'
  total_usd: number | null
  trm: number | null
  total_cop: number
  notas: string
  correo?: string
  cuenta_id: string | null
  items: EditarCompraItemInput[]
}

export type EditarCompraResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarCompraAction(compraId: string, data: EditarCompraInput): Promise<EditarCompraResult> {
  const { userId, adminClient } = await verificarAdmin()

  if (!data.cuenta_id)
    return { ok: false, error: 'Selecciona la cuenta de pago: de dónde salió el dinero de esta compra' }

  const numeroFactura = data.numero_factura.trim() || null

  // El número de factura es obligatorio y único (candado anti-duplicados).
  // EXCEPCIÓN: compras viejas que nacieron sin número (pre-obligatoriedad)
  // se pueden seguir editando sin él — exigirlo bloqueaba cualquier arreglo.
  if (!numeroFactura) {
    const { data: actual } = await adminClient
      .from('compras')
      .select('numero_factura')
      .eq('id', compraId)
      .maybeSingle()
    if (actual?.numero_factura) {
      return { ok: false, error: 'El número de factura es obligatorio (esta compra ya tenía uno — no se puede quitar)' }
    }
  }

  // Verificar duplicado de número de factura excluyendo esta compra
  if (numeroFactura) {
    const { data: existentes } = await adminClient
      .from('compras')
      .select('id, proveedor, fecha')
      .eq('numero_factura', numeroFactura)
      .neq('id', compraId)
      .limit(1)
    const existente = existentes?.[0]
    if (existente) {
      return { ok: false, error: `La factura "${numeroFactura}" ya existe en otra compra (${existente.proveedor} — ${existente.fecha})` }
    }
  }

  // La suma de los productos debe cuadrar con el total de la factura (misma
  // regla que al crear; tolerancia solo de redondeo: $50/producto, mín $200).
  // En compras de USA la tolerancia sube al 1% del total: los costos en COP
  // vienen de la conversión USD→COP con impuestos y envío repartidos, y en
  // facturas viejas ese redondeo acumulado bloqueaba la edición.
  const sumaItemsEd = data.items.reduce((s, it) => s + (it.costo_unitario_cop || 0) * (it.cantidad || 0), 0)
  const diferenciaEd = Math.abs((data.total_cop || 0) - sumaItemsEd)
  const toleranciaEd = data.tipo === 'usa'
    ? Math.max(200, data.items.length * 50, Math.round((data.total_cop || 0) * 0.01))
    : Math.max(200, data.items.length * 50)
  if (data.total_cop > 0 && sumaItemsEd > 0 && diferenciaEd > toleranciaEd) {
    return {
      ok: false,
      error: `La suma de los productos ($${sumaItemsEd.toLocaleString('es-CO')}) no cuadra con el total de la factura ($${data.total_cop.toLocaleString('es-CO')}) — diferencia de $${diferenciaEd.toLocaleString('es-CO')}. Revisa los costos, las cantidades o si hay una fila repetida.`,
    }
  }

  const { error } = await adminClient
    .from('compras')
    .update({
      tipo:           data.tipo,
      proveedor:      data.proveedor.trim(),
      fecha:          data.fecha,
      numero_factura: numeroFactura,
      total_usd:      data.tipo === 'usa' ? data.total_usd : null,
      trm:            data.tipo === 'usa' ? data.trm : null,
      total_cop:      data.total_cop,
      notas:          data.notas.trim() || null,
      correo:         data.correo?.trim().toLowerCase() || null,
      cuenta_id:      data.cuenta_id || null,
    })
    .eq('id', compraId)

  if (error) return { ok: false, error: error.message }

  // ── Sincronizar items: eliminar los quitados, actualizar los existentes,
  //    insertar los nuevos ──────────────────────────────────────────────────
  const { data: existentes } = await adminClient
    .from('compra_items').select('id').eq('compra_id', compraId)

  const idsEnPayload = new Set(data.items.filter(i => i.id).map(i => i.id as string))
  const idsAEliminar = (existentes ?? []).map(e => e.id).filter(id => !idsEnPayload.has(id))

  if (idsAEliminar.length > 0) {
    const { error: errDel } = await adminClient
      .from('compra_items').delete().in('id', idsAEliminar)
    if (errDel) {
      return {
        ok: false,
        error: 'No se pudo eliminar un artículo porque ya tiene movimientos de inventario asociados. Quita primero esos movimientos desde Inventario.',
      }
    }
  }

  for (const item of data.items) {
    // Resolver pedido si el destino es 'pedido' y viene la referencia
    let pedidoId: string | null = null
    let pedidoItemIndice: number | null = null
    let pedidoEstado: string | null = null
    if (item.destino === 'pedido' && item.pedido_ref?.trim()) {
      const ref = item.pedido_ref.trim().toUpperCase()
      const pedido = await _resolverPedidoPorRef(adminClient, ref)
      if (!pedido) return { ok: false, error: `Pedido "${ref}" no encontrado` }
      pedidoId = pedido.id
      pedidoItemIndice = pedido.indice
      pedidoEstado = pedido.estado
    }

    const campos = {
      codigo:             item.codigo?.trim() || null,
      descripcion:        item.descripcion.trim(),
      marca:              item.marca.trim() || null,
      talla:              item.talla.trim() || null,
      cantidad:           item.cantidad,
      costo_unitario_cop: item.costo_unitario_cop,
      destino:            item.destino,
      articulo_id:        item.articulo_id || null,
      pedido_id:          pedidoId,
      pedido_item_indice: pedidoItemIndice,
    }

    let itemId: string
    if (item.id) {
      const { error: errUpd } = await adminClient
        .from('compra_items').update(campos).eq('id', item.id).eq('compra_id', compraId)
      if (errUpd) return { ok: false, error: `Error actualizando item: ${errUpd.message}` }
      itemId = item.id
    } else {
      const { data: creado, error: errIns } = await adminClient
        .from('compra_items').insert({ compra_id: compraId, ...campos }).select('id').single()
      if (errIns || !creado) return { ok: false, error: `Error creando item: ${errIns?.message}` }
      itemId = creado.id
    }

    // El stock queda acorde al destino, tanto en items nuevos como en los que
    // se editaron: entra si es sobrante, sale si se le asignó un pedido. La
    // función mira lo que ya movió este item, así que no duplica entradas.
    await _sincronizarStockCompraItem(
      itemId, item.destino, userId, adminClient,
      `Compra ${numeroFactura ?? ''} — ${data.proveedor.trim()}`.trim(),
    )

    // Avanzar el pedido y vincular artículo del catálogo si se asignó a pedido
    if (pedidoId) {
      if (pedidoEstado === 'pendiente') {
        await adminClient.from('pedidos')
          .update({ estado: 'comprado', fecha_actualizacion: new Date().toISOString() })
          .eq('id', pedidoId)
      }
      await _resolverArticuloCompraItem(itemId, pedidoId, pedidoItemIndice, adminClient)
    }
  }

  // El egreso en flujo de caja es secundario: si falla, la compra ya se guardó.
  try {
    await _sincronizarGastoCompra(
      compraId, data.fecha, data.total_cop,
      data.proveedor.trim(), numeroFactura,
      data.cuenta_id || null, userId, adminClient
    )
  } catch (e) {
    console.error('Error sincronizando gasto de compra:', e)
  }

  revalidatePath('/compras')
  revalidatePath(`/compras/${compraId}`)
  revalidatePath('/flujo-caja')
  revalidatePath('/gastos')

  return { ok: true }
}

export type EliminarCompraResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarCompraAction(compraId: string): Promise<EliminarCompraResult> {
  const { adminClient } = await verificarAdmin()

  // Borrar gasto asociado antes de borrar la compra
  await adminClient.from('gastos').delete().eq('origen', 'compra').eq('origen_id', compraId)

  const { error } = await adminClient
    .from('compras')
    .delete()
    .eq('id', compraId)

  if (error) return { ok: false, error: error.message }

  redirect('/compras')
}

// ─── Llegó todo: marcar en Bucaramanga los pedidos de una compra ─────────────

export type MarcarLlegadaResult =
  | { ok: true; marcados: string[]; omitidos: string[] }
  | { ok: false; error: string }

// Cuando la mercancía de una factura llega completa, este botón pasa TODOS los
// pedidos asignados a esa compra al estado 'bucaramanga' de una sola vez.
// Usa el mismo RPC del cambio individual (historial y validaciones incluidos).
// Solo toca pedidos en camino (pendiente/comprado/usa); los demás se omiten.
export async function marcarLlegadaCompraAction(compraId: string): Promise<MarcarLlegadaResult> {
  const { userId, adminClient } = await verificarAdmin()
  const supabase = await createClient()

  const { data: items } = await adminClient
    .from('compra_items')
    .select('pedido_id, pedido:pedidos (id, numero_orden, estado)')
    .eq('compra_id', compraId)
    .not('pedido_id', 'is', null)

  if (!items || items.length === 0) {
    return { ok: false, error: 'Esta compra no tiene pedidos asignados.' }
  }

  // Pedidos únicos (una compra puede tener varios items del mismo pedido)
  const pedidos = new Map<string, { numero_orden: string; estado: string }>()
  for (const it of items as any[]) {
    const p = Array.isArray(it.pedido) ? it.pedido[0] : it.pedido
    if (p) pedidos.set(p.id, { numero_orden: p.numero_orden, estado: p.estado })
  }

  const EN_CAMINO = ['pendiente', 'comprado', 'usa']
  const marcados: string[] = []
  const omitidos: string[] = []

  for (const [id, p] of pedidos) {
    if (!EN_CAMINO.includes(p.estado)) {
      omitidos.push(`${p.numero_orden} (${p.estado})`)
      continue
    }
    const { error } = await supabase.rpc('cambiar_estado_pedido', {
      p_pedido_id:    id,
      p_nuevo_estado: 'bucaramanga',
      p_usuario_id:   userId,
    })
    if (error) {
      omitidos.push(`${p.numero_orden} (error: ${error.message})`)
    } else {
      marcados.push(p.numero_orden)
    }
  }

  revalidatePath(`/compras/${compraId}`)
  revalidatePath('/pedidos')
  revalidatePath('/pedidos/galeria')
  return { ok: true, marcados, omitidos }
}
