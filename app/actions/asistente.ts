'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { puedeTransicionar } from '@/lib/domain/estados'
import { EstadoPedido, METODO_PAGO_LABELS, METODOS_PAGO } from '@/types'
import { crearFacturaAction, buscarPedidoFacturableAction } from '@/app/actions/facturacion'
import { crearDomicilioAction } from '@/app/actions/domicilios'
import { hoyBogota } from '@/lib/utils/format'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type MensajeChat = { role: 'user' | 'assistant'; content: string }

// ─── Contexto de pedidos pendientes (resumen liviano) ─────────────────────────

async function getPedidosPendientes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select(
      'numero_orden,estado,total,total_pagado,en_alerta,es_zombie,' +
      'tipo_entrega,fecha_creacion,fecha_actualizacion,' +
      'sede_codigo,cliente_nombre,cliente_telefono,asesor_nombre,notas'
    )
    .not('estado', 'in', '("entregado","cancelado")')
    .order('fecha_creacion', { ascending: true })
    .limit(120)
  return data ?? []
}

function formatearContexto(pedidos: any[]) {
  const hoy = new Date()
  return pedidos.map(p => {
    const dias = Math.floor((hoy.getTime() - new Date(p.fecha_creacion).getTime()) / 86400000)
    const saldo = p.total - p.total_pagado
    const flags = [p.en_alerta && 'ALERTA', p.es_zombie && 'ZOMBIE', dias > 7 && `${dias}días`].filter(Boolean).join(',')
    return [
      `[${p.numero_orden}]`, p.cliente_nombre, p.cliente_telefono,
      `estado:${p.estado}`, `total:$${p.total.toLocaleString('es-CO')}`,
      saldo > 0 ? `saldo:$${saldo.toLocaleString('es-CO')}` : 'PAGADO',
      `dias:${dias}`, `asesor:${p.asesor_nombre}`, p.sede_codigo,
      p.tipo_entrega === 'domicilio' ? 'DOMI' : 'SEDE',
      flags || null, p.notas ? `nota:"${p.notas}"` : null,
    ].filter(Boolean).join(' | ')
  }).join('\n')
}

// ─── Funciones de acceso a datos ──────────────────────────────────────────────

async function buscarPedidoBase(numeroOrden: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, estado, total, total_pagado, sede_id')
    .eq('numero_orden', numeroOrden.toUpperCase().trim())
    .single()
  return data
}

async function buscarPedidoDetalle(numeroOrden: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pedidos')
    .select(`
      id, numero_orden, estado, total, tipo, tipo_entrega, direccion_entrega, notas,
      fecha_creacion, factura_id,
      sedes(codigo, nombre),
      clientes(nombre, telefono_normalizado),
      usuarios(nombre),
      pedido_items(marca, descripcion, talla, cantidad, precio_venta),
      pagos(monto, metodo, fecha)
    `)
    .eq('numero_orden', numeroOrden.toUpperCase().trim())
    .maybeSingle()

  if (!data) return null
  const totalPagado = ((data.pagos as any[]) ?? []).reduce((s: number, p: any) => s + p.monto, 0)
  const saldo = data.total - totalPagado
  const sede = Array.isArray(data.sedes) ? data.sedes[0] : data.sedes as any
  const cliente = Array.isArray(data.clientes) ? data.clientes[0] : data.clientes as any
  const asesor = Array.isArray(data.usuarios) ? data.usuarios[0] : data.usuarios as any

  return {
    id: data.id,
    numero_orden: data.numero_orden,
    estado: data.estado,
    total: data.total,
    total_pagado: totalPagado,
    saldo,
    tipo_entrega: data.tipo_entrega,
    direccion_entrega: data.direccion_entrega ?? null,
    notas: data.notas ?? null,
    facturado: !!data.factura_id,
    sede: sede?.codigo ?? '',
    cliente_nombre: cliente?.nombre ?? '',
    cliente_telefono: cliente?.telefono_normalizado ?? '',
    asesor: asesor?.nombre ?? '',
    items: ((data.pedido_items as any[]) ?? [])
      .map((i: any) => `${i.marca} ${i.descripcion}${i.talla ? ' T' + i.talla : ''} x${i.cantidad} = $${(i.precio_venta * i.cantidad).toLocaleString('es-CO')}`)
      .join(' | '),
    pagos: ((data.pagos as any[]) ?? [])
      .map((p: any) => `$${p.monto.toLocaleString('es-CO')} (${p.metodo}) ${p.fecha}`)
      .join(' | '),
  }
}

// ─── Ejecutores de herramientas ───────────────────────────────────────────────

async function ejecutarBuscarPedido(numeroOrden: string): Promise<string> {
  const d = await buscarPedidoDetalle(numeroOrden)
  if (!d) return `Pedido "${numeroOrden}" no encontrado.`
  return JSON.stringify(d)
}

async function ejecutarCambiarEstado(numeroOrden: string, nuevoEstado: string): Promise<string> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return 'No tienes permisos para cambiar estados.'
  const pedido = await buscarPedidoBase(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso a este pedido.'
  if (!puedeTransicionar(pedido.estado as EstadoPedido, nuevoEstado as EstadoPedido, sesion.rol)) {
    if (sesion.rol === 'asesor' && nuevoEstado === 'cancelado') return 'Solo el administrador puede cancelar pedidos.'
    return `No se puede cambiar de "${pedido.estado}" a "${nuevoEstado}".`
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id: pedido.id, p_nuevo_estado: nuevoEstado, p_usuario_id: sesion.id,
  })
  if (error) return `Error: ${error.message}`
  return `Pedido ${numeroOrden} actualizado a "${nuevoEstado}".`
}

async function ejecutarRegistrarPago(numeroOrden: string, monto: number, metodo: string, notas: string): Promise<string> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return 'No tienes permisos para registrar pagos.'
  const pedido = await buscarPedidoBase(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso a este pedido.'
  if (pedido.estado === 'cancelado') return 'No se pueden registrar pagos en pedidos cancelados.'
  const saldo = pedido.total - pedido.total_pagado
  if (monto <= 0) return 'El monto debe ser mayor a cero.'
  if (monto > saldo) return `El monto supera el saldo ($${saldo.toLocaleString('es-CO')}).`
  const supabase = await createClient()
  const { error } = await supabase.from('pagos').insert({
    pedido_id: pedido.id, monto, metodo,
    fecha: hoyBogota(),
    notas: notas || null, asesor_id: sesion.id,
  })
  if (error) return `Error: ${error.message}`
  return `Pago de $${monto.toLocaleString('es-CO')} registrado en ${numeroOrden} (${metodo}).`
}

async function ejecutarAgregarNota(numeroOrden: string, nota: string): Promise<string> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return 'No tienes permisos para editar notas.'
  const pedido = await buscarPedidoBase(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso.'
  const supabase = await createClient()
  const { error } = await supabase.from('pedidos')
    .update({ notas: nota.trim(), fecha_actualizacion: new Date().toISOString() })
    .eq('id', pedido.id)
  if (error) return `Error: ${error.message}`
  return `Nota actualizada en ${numeroOrden}.`
}

async function ejecutarCrearFactura(numeroOrden: string, diasVencimiento: number): Promise<string> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return 'No tienes permisos para crear facturas.'
  const busqueda = await buscarPedidoFacturableAction(numeroOrden)
  if (!busqueda.ok) return `No se puede facturar: ${busqueda.error}`

  const dias = Math.max(1, diasVencimiento || 30)
  const fechaVenc = new Date()
  fechaVenc.setDate(fechaVenc.getDate() + dias)
  const fecha_vencimiento = fechaVenc.toISOString().slice(0, 10)

  const result = await crearFacturaAction({
    cliente_id:        busqueda.data.cliente_id,
    pedido_ids:        [busqueda.data.pedido_id],
    fecha_vencimiento,
    notas:             '',
    abono_inicial:     0,
    metodo_abono:      'efectivo',
  })

  if (!result.ok) return `Error al crear factura: ${result.error}`
  return `Factura creada para ${numeroOrden}. Vence el ${fecha_vencimiento}. ID: ${result.facturaId}`
}

async function ejecutarCrearDomicilio(params: {
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  mensajeria: 'exneider' | 'servigo'
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  articulo: string
  numero_pedido: string
  notas: string
}): Promise<string> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return 'No tienes permisos para crear domicilios.'
  const result = await crearDomicilioAction({
    fecha:             hoyBogota(),
    cliente_nombre:    params.cliente_nombre,
    cliente_telefono:  params.cliente_telefono,
    direccion:         params.direccion,
    mensajeria:        params.mensajeria as any,
    tipo_cobro:        'mensajero',
    cobrar_al_cliente: true,
    metodo_pago:       'efectivo',
    valor_pedido:      params.valor_pedido,
    valor_domicilio:   params.valor_domicilio,
    articulo:          params.articulo,
    cuenta_id:         null,
    numero_pedido:     params.numero_pedido,
    notas:             params.notas ?? '',
  })
  if (!result.ok) return `Error al crear domicilio: ${result.error}`
  return `Domicilio creado para ${params.cliente_nombre} — ${params.mensajeria}, ${params.direccion}.`
}

// ─── Definición de herramientas ───────────────────────────────────────────────

const METODOS_ENUM = METODOS_PAGO as string[]

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_pedido',
    description: 'Busca un pedido por número de orden y devuelve todos sus detalles: cliente, estado, saldo, ítems, pagos, dirección de entrega, si ya está facturado. Úsalo SIEMPRE antes de crear factura o domicilio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string', description: 'Número del pedido (ej: TR2540)' },
      },
      required: ['numero_orden'],
    },
  },
  {
    name: 'cambiar_estado',
    description: 'Cambia el estado de un pedido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string' },
        nuevo_estado: {
          type: 'string',
          enum: ['pendiente', 'comprado', 'listo', 'enviado', 'santa_rosa', 'entregado', 'cancelado'],
        },
      },
      required: ['numero_orden', 'nuevo_estado'],
    },
  },
  {
    name: 'registrar_pago',
    description: 'Registra un pago o abono en un pedido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string' },
        monto: { type: 'number', description: 'Monto en pesos colombianos' },
        metodo: { type: 'string', enum: METODOS_ENUM },
        notas: { type: 'string' },
      },
      required: ['numero_orden', 'monto', 'metodo'],
    },
  },
  {
    name: 'agregar_nota',
    description: 'Agrega o reemplaza la nota de un pedido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string' },
        nota: { type: 'string' },
      },
      required: ['numero_orden', 'nota'],
    },
  },
  {
    name: 'crear_factura',
    description: 'Crea una factura para un pedido. El pedido no debe estar ya facturado ni cancelado. Usa buscar_pedido primero si necesitas saber el estado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string', description: 'Número del pedido a facturar' },
        dias_vencimiento: { type: 'number', description: 'Días hasta el vencimiento. Default: 30' },
      },
      required: ['numero_orden'],
    },
  },
  {
    name: 'crear_domicilio',
    description: 'Crea un domicilio SIN factura: para mandados, cambios o encargos que no son una venta. Si es la entrega de una venta, usa crear_factura con entrega a domicilio en su lugar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente_nombre:    { type: 'string' },
        cliente_telefono:  { type: 'string' },
        direccion:         { type: 'string', description: 'Dirección de entrega' },
        mensajeria:        { type: 'string', enum: ['exneider', 'servigo'], description: 'Mensajero que hace la entrega' },
        valor_pedido:      { type: 'number', description: 'Valor a recoger al cliente. 0 si es un mandado sin cobro.' },
        valor_domicilio:   { type: 'number', description: 'Costo del domicilio' },
        cobrar_al_cliente: { type: 'boolean', description: 'true si el cliente paga el domicilio, false si lo paga la tienda' },
        articulo:          { type: 'string', description: 'Descripción de lo que se lleva (ej: cambio de talla, encargo...)' },
        numero_pedido:     { type: 'string', description: 'Referencia opcional (mandado, cambio, etc.)' },
        notas:             { type: 'string', description: 'Instrucciones adicionales para el mensajero' },
      },
      required: ['cliente_nombre', 'direccion', 'mensajeria'],
    },
  },
]

// ─── Loop agentic: ejecuta todas las herramientas hasta obtener respuesta final ─

async function ejecutarHerramienta(nombre: string, input: any): Promise<string> {
  switch (nombre) {
    case 'buscar_pedido':
      return ejecutarBuscarPedido(input.numero_orden)
    case 'cambiar_estado':
      return ejecutarCambiarEstado(input.numero_orden, input.nuevo_estado)
    case 'registrar_pago':
      return ejecutarRegistrarPago(input.numero_orden, input.monto, input.metodo, input.notas || '')
    case 'agregar_nota':
      return ejecutarAgregarNota(input.numero_orden, input.nota)
    case 'crear_factura':
      return ejecutarCrearFactura(input.numero_orden, input.dias_vencimiento ?? 30)
    case 'crear_domicilio':
      return ejecutarCrearDomicilio(input)
    default:
      return 'Herramienta desconocida.'
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `Eres el asistente interno de Tres Bandas, tienda de ropa y calzado en Bucaramanga, Colombia, con sedes TR (Bucaramanga), CR (Cúcuta) y SR (Santa Rosa).

Puedes hacer lo siguiente usando las herramientas disponibles:
- Consultar detalles completos de cualquier pedido (buscar_pedido)
- Cambiar el estado de un pedido (cambiar_estado)
- Registrar pagos y abonos (registrar_pago)
- Agregar notas a pedidos (agregar_nota)
- Crear facturas para pedidos (crear_factura)
- Crear domicilios sin factura para mandados, cambios o encargos (crear_domicilio)

Cuando un domicilio es la entrega de una venta, NO uses crear_domicilio: el domicilio se crea automáticamente al facturar el pedido con entrega a domicilio. Usa crear_domicilio SOLO para mandados o encargos que no son una venta.

Estados del pedido: pendiente → comprado → listo → enviado / santa_rosa → entregado. cancelado es irreversible.

Métodos de pago disponibles: ${METODOS_PAGO.map(m => `${m} (${METODO_PAGO_LABELS[m]})`).join(', ')}.

Responde siempre en español, de forma directa y concisa. Cuando ejecutes acciones, confirma brevemente qué hiciste y el resultado.`

// ─── Server actions ───────────────────────────────────────────────────────────

function textoDe(r: Anthropic.Message): string {
  const bloque = r.content.find(b => b.type === 'text')
  return bloque && bloque.type === 'text' ? bloque.text : ''
}

function mensajeError(e: any): string {
  const msg = e?.error?.error?.message || e?.message || String(e)
  if (/api[_\s-]?key|authentication|x-api-key/i.test(msg))
    return '⚠️ La API Key de Claude no es válida o no está configurada. Verifica ANTHROPIC_API_KEY en Vercel.'
  if (/credit|billing|quota|insufficient/i.test(msg))
    return '⚠️ La cuenta de Claude no tiene créditos disponibles. Recarga saldo en console.anthropic.com.'
  return `⚠️ No se pudo consultar a Claude: ${msg}`
}

export async function resumenAsistenteAction(): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedidos = await getPedidosPendientes()
  if (!pedidos.length) return '¡No hay pedidos pendientes! Todo está al día. ✅'
  const hoy = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date())
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}.\n\nPedidos pendientes (${pedidos.length}):\n${formatearContexto(pedidos)}\n\nGenera un resumen ejecutivo: cuántos hay, el estado general, el saldo total por cobrar y qué requiere atención inmediata. Sé directo.`,
      }],
    })
    return textoDe(r)
  } catch (e) { return mensajeError(e) }
}

export async function alertasAsistenteAction(): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedidos = await getPedidosPendientes()
  if (!pedidos.length) return 'Sin alertas activas.'
  const hoy = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date())
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}.\n\nPedidos pendientes:\n${formatearContexto(pedidos)}\n\nLista SOLO los casos urgentes: zombies, +7 días sin moverse, enviados +3 días sin confirmar entrega, en alerta. Máximo 6 casos. Por cada uno: número, cliente, motivo y qué hacer.`,
      }],
    })
    return textoDe(r)
  } catch (e) { return mensajeError(e) }
}

export async function chatAsistenteAction(
  pregunta: string,
  historial: MensajeChat[]
): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedidos = await getPedidosPendientes()
  const hoy = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date())
  const ctx = pedidos.length
    ? `${pedidos.length} pedidos pendientes:\n${formatearContexto(pedidos)}`
    : 'Sin pedidos pendientes.'

  // El visor es de solo lectura: solo se le exponen herramientas de consulta.
  const herramientas = sesion.rol === 'visor'
    ? TOOLS.filter(t => t.name === 'buscar_pedido')
    : TOOLS

  const mensajes: Anthropic.MessageParam[] = [
    { role: 'user', content: `Contexto (${hoy}):\n${ctx}` },
    { role: 'assistant', content: 'Entendido, tengo el contexto. ¿En qué te ayudo?' },
    ...historial.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: pregunta },
  ]

  try {
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: SYSTEM,
      messages: mensajes,
      tools: herramientas,
      tool_choice: { type: 'auto' },
    })

    // Loop agentic: permite múltiples rondas de herramientas (ej: buscar → facturar → domicilio)
    let turnos = 0
    while (response.stop_reason === 'tool_use' && turnos < 6) {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const resultado = await ejecutarHerramienta(block.name, block.input as any)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultado })
      }

      mensajes.push({ role: 'assistant', content: response.content })
      mensajes.push({ role: 'user', content: toolResults })

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM,
        messages: mensajes,
        tools: TOOLS,
        tool_choice: { type: 'auto' },
      })
      turnos++
    }

    return textoDe(response)
  } catch (e) { return mensajeError(e) }
}
