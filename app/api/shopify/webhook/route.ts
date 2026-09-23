import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Webhook de Shopify — "Pedido por Link" (mig. 200).
// Shopify llama aquí cuando el cliente COMPLETA el checkout del borrador
// (evento orders/create). Reglas de seguridad, en orden:
//
// 1. FIRMA HMAC obligatoria (SHOPIFY_WEBHOOK_SECRET, timingSafeEqual sobre el
//    cuerpo crudo): sin firma válida no se toca nada. El cuerpo es contenido
//    EXTERNO — siempre datos, jamás instrucciones.
// 2. La IDENTIDAD es el tag tb:<uuid> que puso generarLinkClienteAction:
//    un UUID nuestro, inadivinable. Órdenes de la tienda sin ese tag (ventas
//    normales de Shopify) se ignoran; un tag inventado no matchea ninguna
//    fila; y el link sobrevive a renombres del pedido (separar/editar).
// 3. La marca 'confirmado' se pone AL FINAL: si cualquier escritura falla se
//    responde 500 y el reintento de Shopify REAPLICA todo (las escrituras son
//    idempotentes; el historial puede duplicar constancia en un reintento —
//    ruido aceptable, jamás pérdida).
// 4. Ficha del cliente: si estaba INCOMPLETA (sin dirección — el cliente
//    nuevo para el que existe este flujo), lo que él llenó manda. Si estaba
//    completa (cliente antiguo, link generado de más), solo se llenan campos
//    vacíos — nunca se pisa un dato bueno. El teléfono no se toca JAMÁS: es
//    la llave de identidad.
// 5. Pedido cancelado después del link: se registra la confirmación en el
//    link (auditoría) pero NO se escribe en clientes ni en el pedido.
//
// Limitación documentada (modo "solo datos"): este webhook NO registra pagos.
// La tienda debe tener método de pago manual; si el checkout llegara a cobrar
// en línea, ese dinero queda en Shopify y se registra a mano como abono
// (financial_status queda guardado en datos_cliente para poder verlo).

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook sin configurar', { status: 500 })

  const raw = await req.text()
  const firma = req.headers.get('x-shopify-hmac-sha256') ?? ''
  const esperado = createHmac('sha256', secret).update(raw, 'utf8').digest('base64')
  const a = Buffer.from(esperado)
  const b = Buffer.from(firma)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('Firma inválida', { status: 401 })
  }

  const topic = req.headers.get('x-shopify-topic') ?? ''
  if (topic !== 'orders/create') return new Response('ok', { status: 200 })

  let order: any
  try {
    order = JSON.parse(raw)
  } catch {
    return new Response('ok', { status: 200 })
  }

  // Identidad: tag tb:<uuid> (regla 2). Sin él, no es de nuestros links.
  const tags = String(order?.tags ?? '')
    .split(',')
    .map((t: string) => t.trim().toLowerCase())
    .filter(Boolean)
  const tagLink = tags.find((t: string) => /^tb:[0-9a-f-]{36}$/.test(t))
  if (!tagLink) return new Response('ok', { status: 200 })
  const linkId = tagLink.slice('tb:'.length)

  const admin = createAdminClient()

  const { data: link, error: errLink } = await admin
    .from('shopify_links')
    .select('id, pedido_id, estado, creado_por')
    .eq('id', linkId)
    .maybeSingle()
  if (errLink) return new Response('Error BD', { status: 500 })   // Shopify reintenta
  if (!link) return new Response('ok', { status: 200 })            // uuid sin fila (huérfano/ajeno)
  if (link.estado === 'confirmado') return new Response('ok', { status: 200 }) // ya procesado

  const { data: pedido, error: errPed } = await admin
    .from('pedidos')
    .select('id, cliente_id, estado, tipo_entrega, direccion_entrega')
    .eq('id', link.pedido_id)
    .maybeSingle()
  if (errPed) return new Response('Error BD', { status: 500 })
  if (!pedido) return new Response('ok', { status: 200 })

  // Datos que llenó el cliente (contenido externo: solo datos).
  const ship = order?.shipping_address ?? null
  const cust = order?.customer ?? null
  const limpiar = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 300) : '')
  const nombre = limpiar(ship?.name) || [limpiar(cust?.first_name), limpiar(cust?.last_name)].filter(Boolean).join(' ')
  const direccion = [limpiar(ship?.address1), limpiar(ship?.address2)].filter(Boolean).join(' ')
  const ciudad = limpiar(ship?.city)
  const email = limpiar(order?.email) || limpiar(order?.contact_email) || limpiar(cust?.email)
  const datos = {
    nombre, direccion, ciudad, email,
    shopify_order: limpiar(order?.name),
    financial_status: limpiar(order?.financial_status),
    pedido_cancelado: pedido.estado === 'cancelado' || undefined,
  }

  // Pedido cancelado después del link (regla 5): constancia sí, escrituras no.
  if (pedido.estado !== 'cancelado') {
    const { data: clienteActual, error: errCliLee } = await admin
      .from('clientes')
      .select('nombre, direccion, ciudad, email, cedula')
      .eq('id', pedido.cliente_id)
      .maybeSingle()
    if (errCliLee) return new Response('Error BD', { status: 500 })

    if (clienteActual) {
      // Regla 4: ficha incompleta (sin dirección) → lo del cliente manda;
      // ficha completa → solo campos vacíos.
      const fichaIncompleta = !(clienteActual.direccion ?? '').trim()
      const cambios: Record<string, string> = {}
      const aplicar = (campo: 'nombre' | 'direccion' | 'ciudad' | 'email', valor: string) => {
        if (!valor) return
        const actual = (clienteActual[campo] ?? '').trim()
        if (fichaIncompleta || !actual) cambios[campo] = valor
      }
      aplicar('nombre', nombre)
      aplicar('direccion', direccion)
      aplicar('ciudad', ciudad)
      aplicar('email', email)

      if (Object.keys(cambios).length > 0) {
        const { error: errCli } = await admin
          .from('clientes')
          .update({ ...cambios, actualizado_en: new Date().toISOString() })
          .eq('id', pedido.cliente_id)
        if (errCli) return new Response('Error BD', { status: 500 })

        // Constancia con el VALOR ANTERIOR (recuperable si algo se pisó).
        // Solo si hay quién la firme (la asesora que generó el link).
        if (link.creado_por) {
          const { error: errHist } = await admin.from('historial_cambios').insert({
            tabla: 'clientes',
            registro_id: pedido.cliente_id,
            campo: 'datos_por_link',
            valor_anterior: JSON.stringify({
              nombre: clienteActual.nombre, direccion: clienteActual.direccion,
              ciudad: clienteActual.ciudad, email: clienteActual.email,
            }),
            valor_nuevo: JSON.stringify(cambios),
            usuario_id: link.creado_por,
          })
          if (errHist) return new Response('Error BD', { status: 500 })
        }
      }
    }

    // Dirección de entrega del pedido, solo si estaba vacía y es a domicilio.
    if (direccion && pedido.tipo_entrega === 'domicilio' && !pedido.direccion_entrega) {
      const { error: errDir } = await admin
        .from('pedidos')
        .update({ direccion_entrega: direccion })
        .eq('id', pedido.id)
      if (errDir) return new Response('Error BD', { status: 500 })
    }
  }

  // ÚLTIMO paso (regla 3): marcar confirmado. Hasta aquí, cualquier fallo hizo
  // que Shopify reintente y todo se reaplique.
  const { data: marcado, error: errMarca } = await admin
    .from('shopify_links')
    .update({
      estado: 'confirmado',
      shopify_order_id: String(order?.id ?? ''),
      shopify_order_name: limpiar(order?.name) || null,
      datos_cliente: datos,
      confirmado_en: new Date().toISOString(),
    })
    .eq('id', link.id)
    .eq('estado', 'pendiente')
    .select('id')
  if (errMarca) return new Response('Error BD', { status: 500 })
  if (!marcado || marcado.length === 0) return new Response('ok', { status: 200 })

  return new Response('ok', { status: 200 })
}
