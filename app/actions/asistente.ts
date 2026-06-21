'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { puedeTransicionar } from '@/lib/domain/estados'
import { EstadoPedido } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type MensajeChat = { role: 'user' | 'assistant'; content: string }

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
    const dias = Math.floor(
      (hoy.getTime() - new Date(p.fecha_creacion).getTime()) / 86400000
    )
    const saldo = p.total - p.total_pagado
    const flags = [
      p.en_alerta && 'ALERTA',
      p.es_zombie && 'ZOMBIE',
      dias > 7 && `${dias}días`,
    ].filter(Boolean).join(',')

    return [
      `[${p.numero_orden}]`,
      p.cliente_nombre,
      p.cliente_telefono,
      `estado:${p.estado}`,
      `total:$${p.total.toLocaleString('es-CO')}`,
      saldo > 0 ? `saldo:$${saldo.toLocaleString('es-CO')}` : 'PAGADO',
      `dias:${dias}`,
      `asesor:${p.asesor_nombre}`,
      p.sede_codigo,
      p.tipo_entrega === 'domicilio' ? 'DOMI' : 'SEDE',
      flags || null,
      p.notas ? `nota:"${p.notas}"` : null,
    ].filter(Boolean).join(' | ')
  }).join('\n')
}

const SYSTEM = `Eres el asistente interno de Tres Bandas, tienda de ropa y calzado en Bucaramanga, Colombia. Ayudas a los asesores a revisar pedidos. Responde siempre en español, directo y útil. Cita pedidos por su número de orden (ej: TR-0041). Los estados posibles son: pendiente (sin abono), pagado (con abono, sin salir), listo (para despachar), enviado (en camino), santa_rosa (enviado a esa sede), entregado, cancelado. Un pedido "zombie" lleva +14 días sin movimiento.`

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function buscarPedido(numeroOrden: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, estado, total, total_pagado, sede_id')
    .eq('numero_orden', numeroOrden.toUpperCase().trim())
    .single()
  return data
}

async function ejecutarCambiarEstado(numeroOrden: string, nuevoEstado: string): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedido = await buscarPedido(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso a este pedido.'
  if (!puedeTransicionar(pedido.estado as EstadoPedido, nuevoEstado as EstadoPedido, sesion.rol)) {
    if (sesion.rol === 'asesor' && nuevoEstado === 'cancelado')
      return 'Solo el administrador puede cancelar pedidos.'
    return `No se puede cambiar de "${pedido.estado}" a "${nuevoEstado}".`
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id: pedido.id,
    p_nuevo_estado: nuevoEstado,
    p_usuario_id: sesion.id,
  })
  if (error) return `Error: ${error.message}`
  return `Pedido ${numeroOrden} actualizado a "${nuevoEstado}" correctamente.`
}

async function ejecutarRegistrarPago(
  numeroOrden: string,
  monto: number,
  metodo: string,
  notas: string
): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedido = await buscarPedido(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso a este pedido.'
  if (pedido.estado === 'cancelado') return 'No se pueden registrar pagos en pedidos cancelados.'
  const saldo = pedido.total - pedido.total_pagado
  if (monto <= 0) return 'El monto debe ser mayor a cero.'
  if (monto > saldo) return `El monto supera el saldo pendiente ($${saldo.toLocaleString('es-CO')}).`
  const supabase = await createClient()
  const { error } = await supabase.from('pagos').insert({
    pedido_id: pedido.id,
    monto,
    metodo,
    fecha: new Date().toISOString().slice(0, 10),
    notas: notas || null,
    asesor_id: sesion.id,
  })
  if (error) return `Error: ${error.message}`
  return `Pago de $${monto.toLocaleString('es-CO')} registrado en ${numeroOrden} (${metodo}).`
}

async function ejecutarAgregarNota(numeroOrden: string, nota: string): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedido = await buscarPedido(numeroOrden)
  if (!pedido) return `Pedido ${numeroOrden} no encontrado.`
  if (!puedeAccederSede(sesion, pedido.sede_id)) return 'Sin acceso a este pedido.'
  if (pedido.estado === 'cancelado') return 'El pedido está cancelado.'
  const supabase = await createClient()
  const { error } = await supabase
    .from('pedidos')
    .update({ notas: nota.trim(), fecha_actualizacion: new Date().toISOString() })
    .eq('id', pedido.id)
  if (error) return `Error: ${error.message}`
  return `Nota actualizada en el pedido ${numeroOrden}.`
}

// ─── Tools definition ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'cambiar_estado',
    description: 'Cambia el estado de un pedido. Úsalo cuando el usuario pida cambiar, actualizar o mover el estado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        numero_orden: { type: 'string', description: 'Número del pedido (ej: TR-0041)' },
        nuevo_estado: {
          type: 'string',
          enum: ['pendiente', 'pagado', 'listo', 'enviado', 'santa_rosa', 'entregado', 'cancelado'],
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
        metodo: {
          type: 'string',
          enum: ['efectivo', 'transferencia', 'tarjeta', 'nequi', 'daviplata', 'otro'],
        },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
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
        nota: { type: 'string', description: 'Texto de la nota' },
      },
      required: ['numero_orden', 'nota'],
    },
  },
]

// ─── Server actions ───────────────────────────────────────────────────────────

export async function resumenAsistenteAction(): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedidos = await getPedidosPendientes()
  if (!pedidos.length) return '¡No hay pedidos pendientes! Todo está al día. ✅'
  const hoy = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date())
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Hoy es ${hoy}.\n\nPedidos pendientes (${pedidos.length}):\n${formatearContexto(pedidos)}\n\nGenera un resumen ejecutivo: cuántos hay, el estado general, el saldo total por cobrar y qué requiere atención inmediata. Sé directo.`,
    }],
  })
  return r.content[0].type === 'text' ? r.content[0].text : ''
}

export async function alertasAsistenteAction(): Promise<string> {
  const sesion = await getSesion()
  if (!sesion) return 'Sin acceso.'
  const pedidos = await getPedidosPendientes()
  if (!pedidos.length) return 'Sin alertas activas.'
  const hoy = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full' }).format(new Date())
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Hoy es ${hoy}.\n\nPedidos pendientes:\n${formatearContexto(pedidos)}\n\nLista SOLO los casos urgentes: zombies, +7 días sin moverse, enviados +3 días sin confirmar entrega, en alerta. Máximo 6 casos. Por cada uno: número de orden, cliente, motivo de urgencia y qué hacer.`,
    }],
  })
  return r.content[0].type === 'text' ? r.content[0].text : ''
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

  const mensajes: Anthropic.MessageParam[] = [
    { role: 'user', content: `Contexto (${hoy}):\n${ctx}` },
    { role: 'assistant', content: 'Entendido, tengo el contexto. ¿En qué te ayudo?' },
    ...historial.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: pregunta },
  ]

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: SYSTEM + '\n\nPuedes usar herramientas para cambiar estados, registrar pagos y agregar notas. Cuando el usuario pida hacer un cambio, usa la herramienta correspondiente.',
    messages: mensajes,
    tools: TOOLS,
    tool_choice: { type: 'auto' },
  })

  if (r.stop_reason === 'tool_use') {
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of r.content) {
      if (block.type !== 'tool_use') continue
      const input = block.input as any
      let resultado: string

      if (block.name === 'cambiar_estado') {
        resultado = await ejecutarCambiarEstado(input.numero_orden, input.nuevo_estado)
      } else if (block.name === 'registrar_pago') {
        resultado = await ejecutarRegistrarPago(input.numero_orden, input.monto, input.metodo, input.notas || '')
      } else if (block.name === 'agregar_nota') {
        resultado = await ejecutarAgregarNota(input.numero_orden, input.nota)
      } else {
        resultado = 'Herramienta desconocida.'
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultado })
    }

    const r2 = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        ...mensajes,
        { role: 'assistant', content: r.content },
        { role: 'user', content: toolResults },
      ],
    })

    return r2.content.find(b => b.type === 'text')?.text ?? ''
  }

  return r.content.find(b => b.type === 'text')?.text ?? ''
}
