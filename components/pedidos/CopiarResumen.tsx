'use client'

import { useState } from 'react'
import { ESTADO_LABELS } from '@/types'
import type { PedidoDetalle } from '@/lib/queries/pedidos'

function formatCOPPlain(v: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(v)
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
  otro: 'Otro',
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

  const guia = pedido.numero_guia ? `\n📬 Guía de envío: ${pedido.numero_guia}` : ''

  const saldoLinea = saldo > 0
    ? `\n💳 Saldo pendiente: *${formatCOPPlain(saldo)}*`
    : '\n✅ Pedido totalmente pagado'

  return `Hola ${pedido.cliente_nombre} 👋\n\nTu pedido *${pedido.numero_orden}* está en: *${estadoLabel}*\n\n📦 Productos:\n${itemsLineas}\n\n💰 Total: ${formatCOPPlain(pedido.total)}\n💵 Pagado: ${formatCOPPlain(pedido.total_pagado)}${saldoLinea}\n\n${entrega}${guia}\n\n¡Gracias por preferirnos! 🛍️`
}

function buildConfirmacion(pedido: PedidoDetalle): string {
  const saldo = pedido.total - pedido.total_pagado
  const fecha = new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(pedido.fecha_creacion))

  const metodoPago = pedido.pagos.length > 0
    ? METODO_LABELS[pedido.pagos[0].metodo] ?? pedido.pagos[0].metodo
    : '—'

  const productos = pedido.items.map((it) => {
    const talla = it.talla ? ` / Talla ${it.talla}` : ''
    return `${it.marca} ${it.descripcion}${talla} — ${formatCOPPlain(it.precio_venta)}`
  }).join('\n🛒 ')

  return `🛍️ Estamos preparando tu pedido
Hola ${pedido.cliente_nombre} 😊
Estamos procesando tu pedido y te enviaremos actualizaciones cuando los artículos estén listos para envío 🚚📦

📌 Resumen del pedido:
🧾 Número de orden: ${pedido.numero_orden}
📅 Fecha del pedido: ${fecha}
🛒 ${productos}
💰 Total del pedido: ${formatCOPPlain(pedido.total)}
💳 Abono: ${formatCOPPlain(pedido.total_pagado)}
💳 Método de pago: ${metodoPago}
📉 Saldo: ${formatCOPPlain(saldo)}

Gracias por comprar con nosotros 🖤
Una experiencia original.
Los cambios y devoluciones están sujetos a los términos y condiciones de la empresa.`
}

function buildGrupo(pedido: PedidoDetalle): string {
  const saldo = pedido.total - pedido.total_pagado

  const metodoPago = pedido.pagos.length > 0
    ? METODO_LABELS[pedido.pagos[0].metodo] ?? pedido.pagos[0].metodo
    : ''

  const articulos = pedido.items.map((it) => {
    const talla = it.talla ? ` / Talla ${it.talla}` : ''
    return `Artículo: ${it.marca} ${it.descripcion}${talla} — ${formatCOPPlain(it.precio_venta)}`
  }).join('\n')

  const ccLinea = pedido.cliente_cedula ? `CC: ${pedido.cliente_cedula}\n` : ''

  const direccion = pedido.tipo_entrega === 'domicilio' && pedido.direccion_entrega
    ? pedido.direccion_entrega
    : 'Recogida en sede'

  const abonoLinea = metodoPago
    ? `Abono: ${formatCOPPlain(pedido.total_pagado)} (${metodoPago})`
    : `Abono: ${formatCOPPlain(pedido.total_pagado)}`

  return `Numero de pedido: ${pedido.numero_orden}
Cliente: ${pedido.cliente_nombre}
${ccLinea}Celular: ${pedido.cliente_telefono}
Dirección: ${direccion}
${articulos}
Total: ${formatCOPPlain(pedido.total)}
${abonoLinea}
Saldo: ${formatCOPPlain(saldo)}
Asesor: ${pedido.asesor_nombre}`
}

interface Props {
  pedido: PedidoDetalle
}

export function CopiarResumen({ pedido }: Props) {
  const [copiadoGrupo, setCopiadoGrupo] = useState(false)
  const [copiadoResumen, setCopiadoResumen] = useState(false)
  const [copiadoConfirmacion, setCopiadoConfirmacion] = useState(false)

  function handleCopiarGrupo() {
    navigator.clipboard.writeText(buildGrupo(pedido)).then(() => {
      setCopiadoGrupo(true)
      setTimeout(() => setCopiadoGrupo(false), 2500)
    })
  }

  function handleCopiarResumen() {
    navigator.clipboard.writeText(buildTexto(pedido)).then(() => {
      setCopiadoResumen(true)
      setTimeout(() => setCopiadoResumen(false), 2500)
    })
  }

  function handleCopiarConfirmacion() {
    navigator.clipboard.writeText(buildConfirmacion(pedido)).then(() => {
      setCopiadoConfirmacion(true)
      setTimeout(() => setCopiadoConfirmacion(false), 2500)
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCopiarGrupo}
        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 transition-colors font-medium"
      >
        {copiadoGrupo ? '✓ Copiado' : '📋 Copiar mensaje para grupo de pedidos'}
      </button>
      <button
        onClick={handleCopiarConfirmacion}
        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors font-medium"
      >
        {copiadoConfirmacion ? '✓ Copiado' : '📋 Copiar mensaje de confirmación para cliente'}
      </button>
      <button
        onClick={handleCopiarResumen}
        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
      >
        {copiadoResumen ? '✓ Copiado al portapapeles' : '📋 Copiar resumen de estado'}
      </button>
    </div>
  )
}
