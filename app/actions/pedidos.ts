'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsearPedido } from '@/lib/parser'
import { normalizarTelefono } from '@/lib/utils/phone'
import { hoyBogota } from '@/lib/utils/format'
import { asignarNumeroOrden } from '@/lib/queries/pedidos'
import { puedeTransicionar } from '@/lib/domain/estados'
import { EstadoPedido, MetodoPago, ParsedPedido, tallasDeCategoria } from '@/types'
import { getSesion, puedeAccederSede, puedeVerPedido } from '@/lib/auth/acceso'
import { bloqueoCajaCerrada } from '@/lib/auth/caja'
import { cuentaIdPorMetodo } from '@/lib/queries/cuentas'

export type CrearPedidoResult =
  | { ok: true; pedidoId: string; numeroOrden: string; avisoCompra?: string }
  | { ok: false; error: string; siguienteNumero?: string }

// ── Compra de más → sugerencia por confirmar ─────────────────────────────────
// Si un artículo del pedido recién creado ya está COMPRADO sin dueño (item de
// compra sin_asignar del mismo artículo y la MISMA talla), ya NO se asigna
// solo (eso movía stock y estado sin que nadie lo revisara — caso TR7467).
// La coincidencia queda como sugerencia PENDIENTE en asignaciones_pendientes
// y el admin la confirma o descarta desde /compras. El pedido sigue su flujo
// normal hasta que la asignación se confirme.
async function _sugerirComprasLibres(pedidoId: string): Promise<string | undefined> {
  const admin = createAdminClient()

  const { data: itemsPed } = await admin
    .from('pedido_items')
    .select('id, articulo_id, codigo, talla, cantidad, marca, descripcion')
    .eq('pedido_id', pedidoId)
    .order('id')
  if (!itemsPed || itemsPed.length === 0) return undefined

  const usados = new Set<string>()
  const sugerencias: Array<{ compra_item_id: string; pedido_id: string; pedido_item_indice: number | null }> = []
  const avisos: string[] = []
  let indice = 0
  for (const it of itemsPed as any[]) {
    indice++
    const talla = (it.talla ?? '').trim().toUpperCase()
    if (!talla) continue // sin talla no hay certeza de que sea la misma unidad
    const cod = (it.codigo ?? '').trim().toUpperCase()
    if (!it.articulo_id && !cod) continue

    let q = admin
      .from('compra_items')
      .select('id, cantidad, compras(numero_factura, proveedor)')
      .is('pedido_id', null)
      .eq('destino', 'sin_asignar')
      .eq('talla', talla)
      .eq('cantidad', it.cantidad)
      .order('creado_en', { ascending: true })
      .limit(5)
    q = it.articulo_id ? q.eq('articulo_id', it.articulo_id) : q.eq('codigo', cod)
    const { data: candidatos } = await q

    const c = ((candidatos ?? []) as any[]).find(x => !usados.has(x.id))
    if (!c) continue
    usados.add(c.id)

    sugerencias.push({
      compra_item_id:     c.id,
      pedido_id:          pedidoId,
      pedido_item_indice: itemsPed.length > 1 ? indice : null,
    })
    const compra = Array.isArray(c.compras) ? c.compras[0] : c.compras
    avisos.push(`${it.marca ?? ''} ${it.descripcion} T${talla} → factura ${compra?.numero_factura ?? 's/n'} (${compra?.proveedor ?? '¿?'})`.trim())
  }

  if (sugerencias.length === 0) return undefined

  // La sugerencia NO asigna nada: ni compra, ni stock, ni estado. Todo eso
  // pasa solo cuando el admin confirma en /compras.
  const { error } = await admin
    .from('asignaciones_pendientes')
    .upsert(sugerencias, { onConflict: 'compra_item_id,pedido_id', ignoreDuplicates: true })
  if (error) {
    console.error('Error guardando sugerencias de compra:', error)
    return undefined
  }

  return `🔎 Puede que ya esté comprado — por confirmar en Compras: ${avisos.join(' · ')}`
}

// Devuelve el error si algún producto está enlazado a una ficha del catálogo
// sin código (SKU); null si todo está bien. Se valida en crear Y editar porque
// el catálogo tiene fichas sin código (creadas automáticamente desde compras).
async function fichaSinCodigo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productos: Array<{ articulo_id?: string | null; descripcion: string }>,
): Promise<string | null> {
  const ids = [...new Set(productos.map(p => p.articulo_id).filter(Boolean))] as string[]
  if (ids.length === 0) return null
  const { data: fichas } = await supabase.from('articulos').select('id, codigo').in('id', ids)
  const sinSku = new Set(
    ((fichas ?? []) as Array<{ id: string; codigo: string | null }>)
      .filter(f => !(f.codigo ?? '').trim())
      .map(f => f.id)
  )
  if (sinSku.size === 0) return null
  const prod = productos.find(p => p.articulo_id && sinSku.has(p.articulo_id))
  return `El artículo "${prod?.descripcion || 'sin nombre'}" está enlazado a una ficha del catálogo SIN código (SKU). Ponle el código a esa ficha en Inventario, o escribe el código correcto y guárdalo como artículo del catálogo.`
}

// Lógica compartida: crea el pedido desde datos ya parseados/editados
async function _crearPedidoConDatos(
  datos: ParsedPedido,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  const sesionPre = await getSesion()
  if (sesionPre.rol === 'visor') return { ok: false, error: 'Sin permisos para crear pedidos' }
  const bloqueo = await bloqueoCajaCerrada(sesionPre)
  if (bloqueo) return { ok: false, error: bloqueo }
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, sede_id, sedes(id, codigo)')
    .eq('id', user.id)
    .single()
  if (!usuario) return { ok: false, error: 'Usuario no encontrado' }

  const { data: sede } = await supabase
    .from('sedes')
    .select('id, codigo')
    .eq('codigo', datos.sede)
    .single()
  if (!sede) return { ok: false, error: `Sede "${datos.sede}" no encontrada en la base de datos` }

  // El asesor solo puede crear pedidos en su propia sede (admin puede en cualquiera).
  if (!puedeAccederSede(sesionPre, sede.id)) {
    return { ok: false, error: 'No puedes crear pedidos en otra sede' }
  }

  // La venta se puede registrar a nombre de otro asesor ACTIVO de la misma
  // sede, o de un administrador (Johan/Ronaldo piden que el equipo les pase
  // pedidos a su nombre). Los pagos siguen firmados por quien los registra.
  // RLS solo deja leer el propio usuario, por eso la validación usa admin.
  let asesorVentaId = usuario.id
  if (datos.asesor_id && datos.asesor_id !== usuario.id) {
    const admin = createAdminClient()
    const { data: asesorSel } = await admin
      .from('usuarios')
      .select('id, rol, sede_id')
      .eq('id', datos.asesor_id)
      .eq('activo', true)
      .single()
    if (!asesorSel || (asesorSel.rol !== 'admin' && asesorSel.sede_id !== sede.id)) {
      return { ok: false, error: 'El asesor seleccionado no es válido para esta sede' }
    }
    asesorVentaId = asesorSel.id
  }

  // El número lo asigna el consecutivo oficial del servidor — el valor que
  // venga del formulario se ignora (evita dedazos y duplicados).
  const numeroOrden = await asignarNumeroOrden(datos.sede)
  if (!numeroOrden) return { ok: false, error: 'No se pudo asignar el número de pedido. Intenta de nuevo.' }

  const telefonoNormalizado = normalizarTelefono(datos.cliente_telefono)
  if (!telefonoNormalizado) return { ok: false, error: 'Teléfono del cliente inválido' }

  // Todo artículo debe venir vinculado al catálogo (código de producto).
  const productoSinCodigo = datos.productos.find(p => !(p as any).articulo_id)
  if (productoSinCodigo) {
    return {
      ok: false,
      error: `El artículo "${productoSinCodigo.descripcion || 'sin nombre'}" no tiene código de producto. Selecciónalo del catálogo antes de crear el pedido.`,
    }
  }

  // El enlace no basta: la ficha enlazada debe tener código (SKU). El catálogo
  // tiene fichas sin código (las crea compras automáticamente) y enlazarlas
  // dejaba el pedido sin SKU rastreable.
  const errorFicha = await fichaSinCodigo(supabase, datos.productos)
  if (errorFicha) return { ok: false, error: errorFicha }

  // La talla es obligatoria PARA TODOS en ropa y tenis (los accesorios no
  // llevan talla). Evita pedidos sin talla que descuadran el inventario.
  const productoSinTalla = datos.productos.find(
    p => tallasDeCategoria((p as any).categoria).length > 0 && !((p.talla ?? '').trim())
  )
  if (productoSinTalla) {
    return {
      ok: false,
      error: `El artículo "${productoSinTalla.descripcion || 'sin nombre'}" necesita talla. La talla es obligatoria en ropa y tenis.`,
    }
  }

  // Datos obligatorios de cada artículo, EN TODAS LAS SEDES (pedido por el
  // usuario). Se valida aquí y no solo en el formulario porque este es el único
  // embudo: por aquí pasan el formulario, el parser de WhatsApp y la voz.
  for (const p of datos.productos) {
    const quien = p.descripcion?.trim() ? `"${p.descripcion.trim()}"` : 'sin nombre'
    if (!p.descripcion?.trim()) {
      return { ok: false, error: 'Hay un artículo sin nombre. El nombre es obligatorio.' }
    }
    if (!p.marca?.trim()) {
      return { ok: false, error: `El artículo ${quien} no tiene marca. La marca es obligatoria.` }
    }
    if (!(p as any).categoria) {
      return { ok: false, error: `El artículo ${quien} no dice si es ropa, tenis o accesorio. La categoría es obligatoria.` }
    }
    if ((p as any).categoria !== 'accesorios' && !(p as any).sexo) {
      return { ok: false, error: `El artículo ${quien} no dice si es de hombre, mujer o niño. Es obligatorio salvo en accesorios.` }
    }
    if (!(p.cantidad >= 1)) {
      return { ok: false, error: `El artículo ${quien} tiene cantidad inválida.` }
    }
    if (!(p.precio_venta > 0)) {
      return { ok: false, error: `El artículo ${quien} no tiene precio de venta. El precio es obligatorio.` }
    }
  }

  // La foto del producto es obligatoria en todos los artículos (asesores):
  // identifica qué se compró (etiquetas, compras, revisión de mercancía).
  if (sesionPre.rol === 'asesor') {
    const productoSinFoto = datos.productos.find(p => !(p as any).imagen_url)
    if (productoSinFoto) {
      return {
        ok: false,
        error: `El artículo "${productoSinFoto.descripcion || 'sin nombre'}" no tiene foto. Carga la imagen del producto antes de crear el pedido.`,
      }
    }
  }

  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('id, nombre, cedula')
    .eq('telefono_normalizado', telefonoNormalizado)
    .single()

  let clienteId: string

  // Dirección y ciudad del pedido se guardan también en la ficha del cliente
  // (la ciudad sale en las etiquetas de impresión). Siempre la más reciente.
  const direccionCliente = datos.direccion?.trim() || null
  const ciudadCliente = datos.ciudad?.trim() || null

  if (clienteExistente) {
    clienteId = clienteExistente.id
    const cambios: Record<string, string> = {}
    if (datos.cliente_doc && !clienteExistente.cedula) {
      cambios.cedula = datos.cliente_doc.replace(/^CC\s*/i, '').trim()
    }
    if (direccionCliente) cambios.direccion = direccionCliente
    if (ciudadCliente) cambios.ciudad = ciudadCliente
    if (Object.keys(cambios).length > 0) {
      await supabase.from('clientes').update(cambios).eq('id', clienteId)
    }
  } else {
    const cedulaLimpia = datos.cliente_doc
      ? datos.cliente_doc.replace(/^CC\s*/i, '').trim()
      : null
    const { data: nuevoCliente, error: errCliente } = await supabase
      .from('clientes')
      .insert({
        telefono_normalizado: telefonoNormalizado,
        nombre: datos.cliente_nombre.trim(),
        cedula: cedulaLimpia,
        direccion: direccionCliente,
        ciudad: ciudadCliente,
      })
      .select('id')
      .single()
    if (errCliente || !nuevoCliente) return { ok: false, error: `Error creando cliente: ${errCliente?.message}` }
    clienteId = nuevoCliente.id
  }

  const items = datos.productos.map((p) => ({
    articulo_id:  (p as any).articulo_id ?? null,
    marca:        p.marca,
    descripcion:  p.descripcion,
    talla:        p.talla ?? '',
    cantidad:     p.cantidad,
    precio_venta: p.precio_venta,
    imagen_url:   (p as any).imagen_url ?? null,
    color:        (p as any).color ?? null,
    sexo:         (p as any).sexo ?? null,
    categoria:    (p as any).categoria ?? null,
  }))
  const total = datos.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)

  // Abonos: si vienen múltiples (pago dividido por varias cuentas) usamos el
  // primero al crear el pedido (atómico) y el resto se insertan después con el
  // RPC validado registrar_pago_pedido. Si no, comportamiento clásico de un abono.
  const abonosMultiples = (datos.abonos ?? []).filter(a => a.monto > 0)
  const primerAbono = abonosMultiples.length > 0
    ? abonosMultiples[0]
    : { monto: datos.abono, metodo: datos.metodo_pago_abono }

  // Rutear el abono a la cuenta que corresponde al método (efectivo → caja de la
  // sede; bancolombia_carlos, nequi_johan… → su cuenta global). Así el saldo se
  // actualiza solo en el flujo de caja.
  let cuentaAbono = (datos as any).cuenta_id_abono ?? null
  if (!cuentaAbono && primerAbono.monto > 0) {
    cuentaAbono = await cuentaIdPorMetodo(supabase, primerAbono.metodo, sede.id)
  }

  const { data: pedidoId, error: errPedido } = await supabase.rpc('crear_pedido', {
    p_numero_orden:     numeroOrden,
    p_sede_id:          sede.id,
    p_asesor_id:        asesorVentaId,
    p_cliente_id:       clienteId,
    p_total:            total,
    p_tipo_entrega:     datos.tipo_entrega,
    p_direccion_entrega: datos.direccion ?? null,
    p_notas:            datos.notas ?? null,
    p_items:            items,
    p_abono:            primerAbono.monto,
    p_metodo_pago:      primerAbono.metodo,
    p_cuenta_id:        cuentaAbono,
  })

  if (errPedido) {
    return { ok: false, error: `Error creando pedido: ${errPedido.message}` }
  }

  // Abonos adicionales (del segundo en adelante) — RPC atómico con validación de saldo.
  const hoy = hoyBogota()
  for (const abono of abonosMultiples.slice(1)) {
    const cuentaAdic = await cuentaIdPorMetodo(supabase, abono.metodo, sede.id)
    const { error: errPago } = await supabase.rpc('registrar_pago_pedido', {
      p_pedido_id: pedidoId,
      p_monto:     abono.monto,
      p_metodo:    abono.metodo,
      p_fecha:     hoy,
      p_asesor_id: usuario.id,
      p_cuenta_id: cuentaAdic,
      p_notas:     null,
    })
    if (errPago) {
      return { ok: false, error: `Pedido creado, pero falló un abono adicional: ${errPago.message}` }
    }
  }

  // ¿Este artículo ya se compró de más? Queda la sugerencia para que el admin
  // confirme (o descarte) la asignación en /compras — ya no se asigna sola.
  let avisoCompra: string | undefined
  try {
    avisoCompra = await _sugerirComprasLibres(pedidoId)
  } catch (e) {
    console.error('Error sugiriendo compras libres al pedido nuevo:', e)
  }

  return { ok: true as const, pedidoId, numeroOrden, avisoCompra }
}

export async function crearPedidoAction(
  textoResumen: string,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  const parseResult = parsearPedido(textoResumen)
  if (!parseResult.ok) return { ok: false, error: parseResult.error }
  return _crearPedidoConDatos(parseResult.data, numeroOrdenManual)
}

export async function crearPedidoDesdeDataAction(
  datos: ParsedPedido,
  numeroOrdenManual: string
): Promise<CrearPedidoResult> {
  return _crearPedidoConDatos(datos, numeroOrdenManual)
}

// ─── Cambiar estado ───────────────────────────────────────────────────────────

export type CambiarEstadoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function cambiarEstadoAction(
  pedidoId: string,
  _estadoActualIgnorado: EstadoPedido,
  nuevoEstado: EstadoPedido
): Promise<CambiarEstadoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  // Leer el estado actual desde la BD — no confiar en el valor que manda el cliente.
  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id, estado')
    .eq('id', pedidoId)
    .single()

  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }

  const estadoActual = pedido.estado as EstadoPedido
  if (!puedeTransicionar(estadoActual, nuevoEstado, sesion.rol)) {
    return {
      ok: false,
      error: sesion.rol === 'asesor' && nuevoEstado === 'cancelado'
        ? 'Solo el administrador puede cancelar pedidos.'
        : `Transición inválida: ${estadoActual} → ${nuevoEstado}`,
    }
  }

  // Regla: no se puede entregar sin factura (salvo venta inmediata).
  if (nuevoEstado === 'entregado') {
    const { data: ped } = await supabase.from('pedidos').select('factura_id, tipo').eq('id', pedidoId).single()
    if (ped && !ped.factura_id && ped.tipo !== 'venta_inmediata') {
      return { ok: false, error: 'Debes facturar el pedido antes de entregarlo.' }
    }
  }

  // Cancelar un pedido facturado anula también su factura (revierte los pagos de
  // la factura, borra domicilios/gastos automáticos y desvincula el pedido), para
  // que la venta no siga contando. Solo admin (igual que anularFacturaAction).
  if (nuevoEstado === 'cancelado') {
    const { data: ped } = await supabase.from('pedidos').select('factura_id').eq('id', pedidoId).single()
    if (ped?.factura_id) {
      if (sesion.rol !== 'admin') {
        return { ok: false, error: 'Este pedido está facturado. Solo el administrador puede anularlo.' }
      }
      const { error: errAnular } = await supabase.rpc('anular_factura', { p_factura_id: ped.factura_id })
      if (errAnular) return { ok: false, error: `No se pudo anular la factura del pedido: ${errAnular.message}` }
    }
  }

  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    pedidoId,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id:   sesion.id,
  })

  if (error) return { ok: false, error: error.message }

  redirect(`/pedidos/${pedidoId}`)
}

// Igual que cambiarEstadoAction pero sin redirect (para cambio inline desde la lista)
export async function cambiarEstadoInlineAction(
  pedidoId: string,
  _estadoActualIgnorado: EstadoPedido,
  nuevoEstado: EstadoPedido
): Promise<CambiarEstadoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id, estado')
    .eq('id', pedidoId)
    .single()

  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }

  const estadoActual = pedido.estado as EstadoPedido
  if (!puedeTransicionar(estadoActual, nuevoEstado, sesion.rol)) {
    return { ok: false, error: `Transición inválida: ${estadoActual} → ${nuevoEstado}` }
  }

  // Regla: no se puede entregar sin factura (salvo venta inmediata).
  if (nuevoEstado === 'entregado') {
    const { data: ped } = await supabase.from('pedidos').select('factura_id, tipo').eq('id', pedidoId).single()
    if (ped && !ped.factura_id && ped.tipo !== 'venta_inmediata') {
      return { ok: false, error: 'Debes facturar el pedido antes de entregarlo.' }
    }
  }

  // Cancelar un pedido facturado anula también su factura (revierte los pagos de
  // la factura, borra domicilios/gastos automáticos y desvincula el pedido), para
  // que la venta no siga contando. Solo admin (igual que anularFacturaAction).
  if (nuevoEstado === 'cancelado') {
    const { data: ped } = await supabase.from('pedidos').select('factura_id').eq('id', pedidoId).single()
    if (ped?.factura_id) {
      if (sesion.rol !== 'admin') {
        return { ok: false, error: 'Este pedido está facturado. Solo el administrador puede anularlo.' }
      }
      const { error: errAnular } = await supabase.rpc('anular_factura', { p_factura_id: ped.factura_id })
      if (errAnular) return { ok: false, error: `No se pudo anular la factura del pedido: ${errAnular.message}` }
    }
  }

  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    pedidoId,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id:   sesion.id,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Marcar llegada a Bucaramanga (desde impresión de etiquetas) ─────────────
// Cuando se imprimen las etiquetas es porque la mercancía llegó: los pedidos
// pasan a estado 'bucaramanga'. Solo avanza pedidos en pendiente/comprado/usa;
// no toca los que ya están en bucaramanga/santa_rosa/entregado/cancelado.

export type MarcarLlegadaResult =
  | { ok: true; marcados: number; omitidos: string[] }
  | { ok: false; error: string }

export async function marcarLlegadaBucaramangaAction(
  pedidoIds: string[]
): Promise<MarcarLlegadaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para cambiar estados' }
  if (pedidoIds.length === 0) return { ok: false, error: 'Sin pedidos' }
  const supabase = await createClient()

  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, estado, sede_id')
    .in('id', pedidoIds)

  const pedidos = (data ?? []) as Array<{ id: string; numero_orden: string; estado: string; sede_id: string }>
  const AVANZABLES = ['pendiente', 'comprado', 'usa']

  let marcados = 0
  const omitidos: string[] = []
  for (const p of pedidos) {
    // Avance logístico (solo hacia adelante, auditado): la mercancía de todas
    // las sedes llega a Bucaramanga, así que aplica entre sedes.
    if (!puedeVerPedido(sesion, p.sede_id)) { omitidos.push(p.numero_orden); continue }
    if (p.estado === 'bucaramanga') continue // ya está, nada que hacer
    if (!AVANZABLES.includes(p.estado)) { omitidos.push(`${p.numero_orden} (${p.estado})`); continue }
    const { error } = await supabase.rpc('cambiar_estado_pedido', {
      p_pedido_id:    p.id,
      p_nuevo_estado: 'bucaramanga',
      p_usuario_id:   sesion.id,
    })
    if (error) omitidos.push(`${p.numero_orden} (${error.message})`)
    else marcados++
  }

  revalidatePath('/pedidos')
  return { ok: true, marcados, omitidos }
}

// ─── Registrar pago ───────────────────────────────────────────────────────────

export type RegistrarPagoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function registrarPagoAction(
  pedidoId: string,
  data: { monto: number; metodo: MetodoPago; fecha: string; notas: string; cuenta_id?: string | null }
): Promise<RegistrarPagoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar pagos' }
  const bloqueo = await bloqueoCajaCerrada(sesion)
  if (bloqueo) return { ok: false, error: bloqueo }
  const supabase = await createClient()

  // Verificar acceso a la sede antes de tocar datos financieros.
  const { data: pedido } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id')
    .eq('id', pedidoId)
    .single()

  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }
  if (!puedeAccederSede(sesion, pedido.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  // Rutear el pago a la cuenta de su método (efectivo → caja de la sede; demás →
  // su cuenta global), para que el saldo se actualice solo en el flujo de caja.
  let cuentaId = data.cuenta_id || null
  if (!cuentaId) cuentaId = await cuentaIdPorMetodo(supabase, data.metodo, pedido.sede_id)

  // El RPC bloquea el pedido con FOR UPDATE antes de validar el saldo,
  // evitando que dos asesores simultáneos sobreabonen el mismo pedido.
  const { error } = await supabase.rpc('registrar_pago_pedido', {
    p_pedido_id: pedidoId,
    p_monto:     data.monto,
    p_metodo:    data.metodo,
    p_fecha:     data.fecha,
    p_asesor_id: sesion.id,
    p_cuenta_id: cuentaId,
    p_notas:     data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Editar pedido ────────────────────────────────────────────────────────────
// Solo campos operacionales (notas, entrega). Los items y el total son inmutables.

export type EditarPedidoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarPedidoAction(
  pedidoId: string,
  data: {
    numero_orden: string
    notas: string
    tipo_entrega: 'sede' | 'domicilio'
    direccion_entrega: string
    cliente_nombre: string
    cliente_telefono: string
    cliente_id: string
    productos: Array<{ articulo_id?: string | null; marca: string; descripcion: string; talla: string; cantidad: number; precio_venta: number; imagen_url?: string | null }>
  }
): Promise<EditarPedidoResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  const { data: pedidoCheck } = await supabase
    .from('vista_pedidos_asesor')
    .select('sede_id, estado, sede_codigo')
    .eq('id', pedidoId)
    .single()

  if (!pedidoCheck) return { ok: false, error: 'Pedido no encontrado' }
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para editar pedidos' }
  if (!puedeAccederSede(sesion, pedidoCheck.sede_id)) return { ok: false, error: 'Sin acceso a este pedido' }
  if (pedidoCheck.estado === 'cancelado') return { ok: false, error: 'No se puede editar un pedido cancelado' }

  const nuevoNumero = data.numero_orden.trim().toUpperCase()
  if (!nuevoNumero) return { ok: false, error: 'El número de pedido es obligatorio' }
  const sedeCodigo = (pedidoCheck as any).sede_codigo as string
  // El código de sede puede venir con prefijo: ventas locales "VL-TR6969" o
  // "VL-FAC-TR-2026-0350" y saldos migrados "SALDO-SR-XXX" también son números
  // válidos de su sede — exigir que empiece pelado con TR/SR/CR bloqueaba
  // editar esos pedidos.
  const numeroBase = nuevoNumero.replace(/^(VL-|SALDO-)?(FAC-)?/, '')
  if (!numeroBase.startsWith(sedeCodigo)) {
    return { ok: false, error: `El número debe ser de la sede ${sedeCodigo} (ej: ${sedeCodigo}6492, VL-${sedeCodigo}…)` }
  }
  if (data.tipo_entrega === 'domicilio' && !data.direccion_entrega.trim()) {
    return { ok: false, error: 'La dirección de entrega es obligatoria para domicilio' }
  }
  if (!data.cliente_nombre.trim()) return { ok: false, error: 'El nombre del cliente es obligatorio' }
  if (data.productos.length === 0) return { ok: false, error: 'Debe haber al menos un producto' }

  const errorFicha = await fichaSinCodigo(supabase, data.productos)
  if (errorFicha) return { ok: false, error: errorFicha }

  // Actualizar cliente (operación independiente — no afecta los items del pedido)
  const telefonoNormalizado = normalizarTelefono(data.cliente_telefono)
  if (!telefonoNormalizado) return { ok: false, error: 'Teléfono inválido' }
  await supabase
    .from('clientes')
    .update({ nombre: data.cliente_nombre.trim(), telefono_normalizado: telefonoNormalizado })
    .eq('id', data.cliente_id)

  const nuevoTotal = data.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)

  // Actualizar pedido + reemplazar items en una sola transacción atómica.
  // Si el insert de items falla, el delete ya efectuado se revierte automáticamente.
  const { error } = await supabase.rpc('editar_pedido', {
    p_pedido_id:         pedidoId,
    p_numero_orden:      nuevoNumero,
    p_notas:             data.notas.trim() || null,
    p_tipo_entrega:      data.tipo_entrega,
    p_direccion_entrega: data.tipo_entrega === 'domicilio' ? data.direccion_entrega.trim() : null,
    p_total:             nuevoTotal,
    p_usuario_id:        sesion.id,
    p_items:             data.productos.map(p => ({
      articulo_id:  p.articulo_id ?? null,
      marca:        p.marca.trim(),
      descripcion:  p.descripcion.trim(),
      talla:        p.talla.trim(),
      cantidad:     p.cantidad,
      precio_venta: p.precio_venta,
      imagen_url:   p.imagen_url ?? null,
    })),
  })

  if (error) {
    if (error.code === '23505') return { ok: false, error: `El número "${nuevoNumero}" ya está en uso.` }
    return { ok: false, error: error.message }
  }

  // Si el pedido pertenece a una factura, recalcular su total/estado para que no
  // se descuadre al cambiar los productos.
  const { data: ped } = await supabase.from('pedidos').select('factura_id').eq('id', pedidoId).maybeSingle()
  if ((ped as any)?.factura_id) {
    await supabase.rpc('recalcular_factura', { p_factura_id: (ped as any).factura_id })
    revalidatePath(`/facturacion/${(ped as any).factura_id}`)
  }

  redirect(`/pedidos/${pedidoId}`)
}

// ─── Editar pago (solo admin) ─────────────────────────────────────────────────
// Permite corregir el monto Y el método de un pago del pedido. Al cambiar el
// método, el pago se re-enruta a la cuenta correcta (efectivo → caja de la
// sede del pedido; electrónicos → su cuenta global), para que el flujo de
// caja quede cuadrado.

export async function editarPagoAction(
  pagoId: string,
  data: { monto: number; metodo: MetodoPago }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo los administradores pueden editar pagos' }
  if (!data.monto || data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const adminClient = createAdminClient()

  const { data: pago } = await adminClient
    .from('pagos')
    .select('monto, metodo, pedido:pedidos(sede_id)')
    .eq('id', pagoId)
    .single()

  if (!pago) return { ok: false, error: 'Pago no encontrado' }

  const sedeId = (Array.isArray((pago as any).pedido) ? (pago as any).pedido[0] : (pago as any).pedido)?.sede_id ?? null
  const cuentaId = await cuentaIdPorMetodo(adminClient, data.metodo, sedeId)

  const { error } = await adminClient
    .from('pagos')
    .update({ monto: data.monto, metodo: data.metodo, cuenta_id: cuentaId })
    .eq('id', pagoId)

  if (error) return { ok: false, error: error.message }

  const cambios: Array<{ campo: string; antes: string; ahora: string }> = []
  if (pago.monto !== data.monto)   cambios.push({ campo: 'monto', antes: String(pago.monto), ahora: String(data.monto) })
  if (pago.metodo !== data.metodo) cambios.push({ campo: 'metodo', antes: pago.metodo, ahora: data.metodo })
  for (const c of cambios) {
    await adminClient.from('historial_cambios').insert({
      tabla:          'pagos',
      registro_id:    pagoId,
      campo:          c.campo,
      valor_anterior: c.antes,
      valor_nuevo:    c.ahora,
      usuario_id:     sesion.id,
    })
  }

  return { ok: true }
}

// ─── Costo manual del pedido (solo admin) ─────────────────────────────────────
// Para pedidos sin compra asignada ni salida de inventario: el admin digita el
// costo total y la ganancia se calcula con ese valor. null = volver al
// costo automático.

export async function asignarCostoManualAction(
  pedidoId: string,
  costo: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede asignar el costo' }
  if (costo !== null && (isNaN(costo) || costo < 0)) return { ok: false, error: 'Costo inválido' }

  const adminClient = createAdminClient()

  const { data: pedido } = await adminClient
    .from('pedidos')
    .select('costo_manual')
    .eq('id', pedidoId)
    .single()
  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }

  const { error } = await adminClient
    .from('pedidos')
    .update({ costo_manual: costo })
    .eq('id', pedidoId)
  if (error) return { ok: false, error: error.message }

  await adminClient.from('historial_cambios').insert({
    tabla:          'pedidos',
    registro_id:    pedidoId,
    campo:          'costo_manual',
    valor_anterior: pedido.costo_manual != null ? String(pedido.costo_manual) : null,
    valor_nuevo:    costo != null ? String(costo) : null,
    usuario_id:     sesion.id,
  })

  // Cuadre de inventario: si la venta de este pedido sacó mercancía que nunca
  // ENTRÓ al sistema (stock en negativo), ponerle el costo manual también
  // registra la entrada que falta para que el stock quede en 0 y no en −1.
  // Solo se compensa el faltante real: nunca se infla stock que estaba bien.
  if (costo !== null) {
    const { data: salidas } = await adminClient
      .from('movimientos_inventario')
      .select('articulo_id, talla, sede_id, delta')
      .eq('pedido_id', pedidoId)
      .eq('tipo', 'salida')

    const grupos = new Map<string, { articulo_id: string; talla: string | null; sede_id: string; unidades: number }>()
    for (const m of (salidas ?? []) as Array<{ articulo_id: string; talla: string | null; sede_id: string; delta: number }>) {
      const clave = `${m.articulo_id}|${m.talla ?? ''}|${m.sede_id}`
      const g = grupos.get(clave) ?? { articulo_id: m.articulo_id, talla: m.talla, sede_id: m.sede_id, unidades: 0 }
      g.unidades += Math.abs(m.delta || 0)
      grupos.set(clave, g)
    }

    if (grupos.size > 0) {
      const { data: itemsPed } = await adminClient
        .from('pedido_items').select('cantidad').eq('pedido_id', pedidoId)
      const unidadesPedido = (itemsPed ?? []).reduce((s, it: any) => s + (it.cantidad || 1), 0) || 1
      const costoUnit = Math.round(costo / unidadesPedido)

      for (const g of grupos.values()) {
        let q = adminClient
          .from('movimientos_inventario')
          .select('delta')
          .eq('articulo_id', g.articulo_id)
          .eq('sede_id', g.sede_id)
          .limit(5000)
        q = g.talla === null ? q.is('talla', null) : q.eq('talla', g.talla)
        const { data: movs } = await q
        const stock = (movs ?? []).reduce((s, m: any) => s + (m.delta || 0), 0)
        if (stock >= 0) continue

        const entrada = Math.min(g.unidades, -stock)
        await adminClient.from('movimientos_inventario').insert({
          articulo_id:        g.articulo_id,
          talla:              g.talla,
          sede_id:            g.sede_id,
          delta:              entrada,
          tipo:               'entrada',
          pedido_id:          pedidoId,
          costo_unitario_cop: costoUnit,
          usuario_id:         sesion.id,
          notas:              'Cuadre por costo manual: mercancía vendida sin ingreso previo',
        })
      }
    }
  }

  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/ganancias')
  revalidatePath('/inventario')
  return { ok: true }
}

// Costo manual de UN producto del pedido (solo admin): se digita en la tabla de
// productos del detalle. La ganancia suma estos costos con los de compras
// asignadas y salidas de inventario; null = quitar el costo del producto.
export async function asignarCostoItemAction(
  itemId: string,
  costo: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede asignar el costo' }
  if (costo !== null && (isNaN(costo) || costo < 0)) return { ok: false, error: 'Costo inválido' }

  const adminClient = createAdminClient()

  const { data: item } = await adminClient
    .from('pedido_items')
    .select('pedido_id, costo_manual')
    .eq('id', itemId)
    .single()
  if (!item) return { ok: false, error: 'Producto no encontrado' }

  const { error } = await adminClient
    .from('pedido_items')
    .update({ costo_manual: costo })
    .eq('id', itemId)
  if (error) return { ok: false, error: error.message }

  await adminClient.from('historial_cambios').insert({
    tabla:          'pedido_items',
    registro_id:    itemId,
    campo:          'costo_manual',
    valor_anterior: item.costo_manual != null ? String(item.costo_manual) : null,
    valor_nuevo:    costo != null ? String(costo) : null,
    usuario_id:     sesion.id,
  })

  revalidatePath(`/pedidos/${item.pedido_id}`)
  revalidatePath('/ganancias')
  return { ok: true }
}

// ─── Eliminar pedido ──────────────────────────────────────────────────────────

export type EliminarPedidoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarPedidoAction(pedidoId: string): Promise<EliminarPedidoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (usuario?.rol !== 'admin') return { ok: false, error: 'Solo los administradores pueden eliminar pedidos' }

  const adminClient = createAdminClient()

  // Candado (21-ago-2026): eliminar borra los pagos en cascada, y si eran plata
  // real el ingreso desaparece del flujo de caja pero el dinero físico sigue en
  // la cuenta → descuadre sin rastro. Un pedido con abonos reales o facturado
  // NO se elimina hasta resolver la plata.
  const [{ data: pedido }, { data: pagosReales }] = await Promise.all([
    adminClient.from('pedidos').select('numero_orden, factura_id').eq('id', pedidoId).maybeSingle(),
    adminClient.from('pagos').select('monto').eq('pedido_id', pedidoId)
      .eq('anulado', false).neq('metodo', 'credito'),
  ])
  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }

  if (pedido.factura_id) {
    return {
      ok: false,
      error: 'Este pedido está FACTURADO. Anula primero la factura (ahí se revierten sus pagos) y luego sí podrás eliminarlo.',
    }
  }

  const totalAbonos = (pagosReales ?? []).reduce((s, p) => s + (p.monto ?? 0), 0)
  if (totalAbonos > 0) {
    return {
      ok: false,
      error: `Este pedido tiene $${totalAbonos.toLocaleString('es-CO')} en abonos reales — si lo eliminas, esa plata desaparece del flujo de caja y la cuenta queda descuadrada. Primero resuelve el abono: devuélvelo al cliente (como gasto), pásalo a bono, o anúlalo desde el perfil del cliente si fue un error. Después podrás eliminar el pedido.`,
    }
  }

  const { error } = await adminClient
    .from('pedidos')
    .delete()
    .eq('id', pedidoId)

  if (error) return { ok: false, error: error.message }

  redirect('/pedidos')
}

export type PedidoPorEntregar = {
  id: string
  numero_orden: string
  cliente_nombre: string
  estado: EstadoPedido
  total: number
  total_pagado: number
  fecha_creacion: string
  sede_codigo: string
}

// Pedidos de un asesor que faltan por entregar (ni entregados ni cancelados).
// Para la ventana del dashboard "Por entregar".
export async function pedidosPorEntregarAction(asesorId: string): Promise<PedidoPorEntregar[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, cliente_nombre, estado, total, total_pagado, fecha_creacion, sede_codigo')
    .eq('asesor_id', asesorId)
    .not('estado', 'in', '("entregado","cancelado")')
    .order('fecha_creacion', { ascending: true })
    .limit(300)
  return (data ?? []) as PedidoPorEntregar[]
}

export type SepararPedidoResult =
  | { ok: true; partes: string[] }
  | { ok: false; error: string }

// Separa un pedido de varios artículos en un pedido por artículo
// (TR6835 → TR6835-1, TR6835-2, …) para facturar/enviar solo lo que ya llegó.
// El RPC reparte los abonos entre las partes sin mover un peso de la caja y
// se lleva las compras ya asignadas a la parte de su artículo.
export async function separarPedidoAction(pedidoId: string): Promise<SepararPedidoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para separar pedidos' }
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc('separar_pedido_por_articulos', { p_pedido_id: pedidoId })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/pedidos')
    revalidatePath('/pedidos/galeria')
    revalidatePath('/facturacion')
    return { ok: true, partes: ((data as any)?.partes ?? []) as string[] }
  } catch {
    return { ok: false, error: 'No se pudo separar el pedido. Recarga la página (F5) e intenta de nuevo.' }
  }
}

export type CambiarEstadoPrendaResult =
  | { ok: true; numeroParte: string }
  | { ok: false; error: string }

// Cambia el estado de UNA prenda de un pedido con varios artículos: si el
// pedido no está separado todavía, se separa primero (TR6835 → -1, -2…) y el
// estado se aplica solo a la parte de esa prenda. Pedido de Johan/Ronaldo:
// cada prenda con su propia pestaña de estado, porque llegan en tiempos
// distintos. El índice es el del artículo en el pedido (0 = primera prenda),
// mismo orden por id que usa el RPC al numerar las partes.
export async function cambiarEstadoPrendaAction(
  pedidoId: string,
  itemIdx: number,
  nuevoEstado: EstadoPedido
): Promise<CambiarEstadoPrendaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado, sede_id, factura_id')
    .eq('id', pedidoId)
    .single()
  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }
  if (pedido.factura_id) {
    return { ok: false, error: 'El pedido ya está facturado — no se puede separar por prendas.' }
  }
  if (nuevoEstado === 'entregado' || nuevoEstado === 'cancelado') {
    return { ok: false, error: 'Entregar o cancelar se hace desde el pedido completo, no por prenda.' }
  }

  const { count } = await supabase
    .from('pedido_items')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId)
  const nItems = count ?? 0

  let parteId = pedido.id
  let numeroParte = pedido.numero_orden
  let estadoDesde = pedido.estado as EstadoPedido

  if (nItems > 1) {
    const { data, error } = await supabase.rpc('separar_pedido_por_articulos', { p_pedido_id: pedidoId })
    if (error) return { ok: false, error: `No se pudo separar el pedido: ${error.message}` }
    const partes = ((data as any)?.partes ?? []) as string[]
    numeroParte = partes[itemIdx] ?? `${pedido.numero_orden}-${itemIdx + 1}`
    const { data: parte } = await supabase
      .from('pedidos')
      .select('id, estado')
      .eq('numero_orden', numeroParte)
      .single()
    if (!parte) return { ok: false, error: `Se separó, pero no se encontró la parte ${numeroParte}` }
    parteId = parte.id
    estadoDesde = parte.estado as EstadoPedido
  }

  if (!puedeTransicionar(estadoDesde, nuevoEstado, sesion.rol)) {
    return { ok: false, error: `Transición inválida: ${estadoDesde} → ${nuevoEstado}` }
  }

  const { error: errEstado } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id:    parteId,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id:   sesion.id,
  })
  if (errEstado) return { ok: false, error: errEstado.message }

  revalidatePath('/pedidos')
  revalidatePath('/pedidos/galeria')
  return { ok: true, numeroParte }
}

export type MarcarLlegadaPrendasResult =
  | { ok: true; partes: string[] }
  | { ok: false; error: string }

// Marca la llegada a Bucaramanga de SOLO algunas prendas de un pedido: si el
// pedido tiene varias y no todas llegaron, se separa primero (TR7115 → -1…-7)
// y únicamente las partes elegidas pasan a 'bucaramanga'. Con todas
// seleccionadas (o una sola prenda), el pedido avanza completo sin separarse.
export async function marcarLlegadaPrendasAction(
  pedidoId: string,
  itemIdxs: number[],
): Promise<MarcarLlegadaPrendasResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  if (itemIdxs.length === 0) return { ok: false, error: 'Sin prendas seleccionadas' }
  const supabase = await createClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, numero_orden, estado, sede_id, factura_id')
    .eq('id', pedidoId)
    .single()
  if (!pedido || !puedeAccederSede(sesion, pedido.sede_id)) {
    return { ok: false, error: 'Sin acceso a este pedido' }
  }

  const { count } = await supabase
    .from('pedido_items')
    .select('id', { count: 'exact', head: true })
    .eq('pedido_id', pedidoId)
  const nItems = count ?? 0

  // Todas las prendas llegaron (o es de una sola): avanza el pedido completo.
  if (nItems <= 1 || itemIdxs.length >= nItems) {
    const { error } = await supabase.rpc('cambiar_estado_pedido', {
      p_pedido_id: pedidoId, p_nuevo_estado: 'bucaramanga', p_usuario_id: sesion.id,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/pedidos')
    revalidatePath('/pedidos/galeria')
    return { ok: true, partes: [pedido.numero_orden] }
  }

  if (pedido.factura_id) {
    return { ok: false, error: `${pedido.numero_orden} ya está facturado — no se puede separar por prendas. Marca la llegada del pedido completo.` }
  }

  const { data, error: errSep } = await supabase.rpc('separar_pedido_por_articulos', { p_pedido_id: pedidoId })
  if (errSep) return { ok: false, error: `No se pudo separar ${pedido.numero_orden}: ${errSep.message}` }
  const partes = ((data as any)?.partes ?? []) as string[]

  const marcadas: string[] = []
  for (const idx of itemIdxs) {
    const numeroParte = partes[idx] ?? `${pedido.numero_orden}-${idx + 1}`
    const { data: parte } = await supabase
      .from('pedidos')
      .select('id, estado')
      .eq('numero_orden', numeroParte)
      .single()
    if (!parte) return { ok: false, error: `Se separó, pero no se encontró la parte ${numeroParte}` }
    if (parte.estado !== 'bucaramanga') {
      const { error } = await supabase.rpc('cambiar_estado_pedido', {
        p_pedido_id: parte.id, p_nuevo_estado: 'bucaramanga', p_usuario_id: sesion.id,
      })
      if (error) return { ok: false, error: `${numeroParte}: ${error.message}` }
    }
    marcadas.push(numeroParte)
  }

  revalidatePath('/pedidos')
  revalidatePath('/pedidos/galeria')
  return { ok: true, partes: marcadas }
}

// Cambiar el asesor de un pedido (solo admin): corrige pedidos registrados
// bajo el asesor equivocado — el ranking y las metas del mes le cuentan la
// venta al asesor correcto. Si el pedido es una venta local (VL) facturada,
// la factura también pasa al asesor nuevo para que ambos queden iguales.
// Los pagos ya registrados no se tocan: cada abono es de quien lo recibió.
export async function cambiarAsesorPedidoAction(
  pedidoId: string,
  nuevoAsesorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede cambiar el asesor' }
  if (!nuevoAsesorId) return { ok: false, error: 'Selecciona el asesor' }
  const admin = createAdminClient()

  const { data: pedido } = await admin
    .from('pedidos')
    .select('id, asesor_id, tipo, factura_id')
    .eq('id', pedidoId)
    .maybeSingle()
  if (!pedido) return { ok: false, error: 'Pedido no encontrado' }
  if (pedido.asesor_id === nuevoAsesorId) return { ok: true }

  const { data: usuarios } = await admin
    .from('usuarios')
    .select('id, nombre, rol, activo')
    .in('id', [pedido.asesor_id, nuevoAsesorId].filter(Boolean) as string[])
  const nuevo = usuarios?.find(u => u.id === nuevoAsesorId)
  if (!nuevo || !nuevo.activo || nuevo.rol === 'visor') {
    return { ok: false, error: 'El asesor seleccionado no es válido' }
  }

  const { error } = await admin
    .from('pedidos')
    .update({ asesor_id: nuevoAsesorId, fecha_actualizacion: new Date().toISOString() })
    .eq('id', pedidoId)
  if (error) return { ok: false, error: error.message }

  // Venta local facturada: la factura lleva el mismo asesor que su pedido VL.
  if (pedido.tipo === 'venta_inmediata' && pedido.factura_id) {
    await admin
      .from('facturas')
      .update({ asesor_id: nuevoAsesorId, actualizado_en: new Date().toISOString() })
      .eq('id', pedido.factura_id)
  }

  // En el historial van los NOMBRES (no los ids) para que el detalle se lea bien.
  await admin.from('historial_cambios').insert({
    tabla:          'pedidos',
    registro_id:    pedidoId,
    campo:          'asesor',
    valor_anterior: usuarios?.find(u => u.id === pedido.asesor_id)?.nombre ?? null,
    valor_nuevo:    nuevo.nombre,
    usuario_id:     sesion.id,
  })

  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/pedidos')
  revalidatePath('/dashboard')
  return { ok: true }
}
