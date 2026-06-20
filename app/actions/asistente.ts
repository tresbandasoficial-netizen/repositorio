'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

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

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      { role: 'user',      content: `Contexto (${hoy}):\n${ctx}` },
      { role: 'assistant', content: 'Entendido, tengo el contexto. ¿En qué te ayudo?' },
      ...historial.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: pregunta },
    ],
  })
  return r.content[0].type === 'text' ? r.content[0].text : ''
}
