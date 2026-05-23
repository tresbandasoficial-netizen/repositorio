'use client'

import { useState } from 'react'
import { ESTADO_LABELS } from '@/types'
import type { PedidoDetalle } from '@/lib/queries/pedidos'

function formatCOPPlain(v: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(v)
}

function buildTexto(pedido: PedidoDetalle): string {
  const saldo = pedido.total - pedido.total_pagado
  const estadoLabel = ESTADO_LABELS[pedido.estado] ?? pedido.estado

  const itemsLineas = pedido.items.map((it) => {
    const talla = it.talla ? ` talla ${it.talla}` : ''
    const cant  = it.cantidad > 1 ? ` x${it.cantidad}` : ''
    return `  • ${it.marca} ${it.descripcion}${talla}${cant} — ${formatCOPPlain(it.precio_venta)}`
  }).join('\n')

  const entrega = pedido.tipo_entrega === 'domicilio'
    ? `🏠 Domicilio: ${pedido.direccion_entrega}`
    : `🏪 Recogida en sede ${pedido.sede_nombre}`

  const guia = pedido.numero_guia
    ? `\n📬 Guía de envío: ${pedido.numero_guia}`
    : ''

  const saldoLinea = saldo > 0
    ? `\n💳 Saldo pendiente: *${formatCOPPlain(saldo)}*`
    : '\n✅ Pedido totalmente pagado'

  return `Hola ${pedido.cliente_nombre} 👋\n\nTu pedido *${pedido.numero_orden}* está en: *${estadoLabel}*\n\n📦 Productos:\n${itemsLineas}\n\n💰 Total: ${formatCOPPlain(pedido.total)}\n💵 Pagado: ${formatCOPPlain(pedido.total_pagado)}${saldoLinea}\n\n${entrega}${guia}\n\n¡Gracias por preferirnos! 🛍️`
}

interface Props {
  pedido: PedidoDetalle
}

export function CopiarResumen({ pedido }: Props) {
  const [copiado, setCopiado] = useState(false)

  function handleCopiar() {
    const texto = buildTexto(pedido)
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  return (
    <button
      onClick={handleCopiar}
      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
    >
      {copiado ? '✓ Copiado al portapapeles' : '📋 Copiar resumen para WhatsApp'}
    </button>
  )
}
