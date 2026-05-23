import Link from 'next/link'
import { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoBadge } from './EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'

interface PedidoCardProps {
  pedido: PedidoRow
  esAdmin: boolean
}

export function PedidoCard({ pedido, esAdmin }: PedidoCardProps) {
  const saldo = pedido.total - pedido.total_pagado

  return (
    <Link href={`/pedidos/${pedido.id}`} className="block hover:bg-gray-50 transition-colors">
      <div className="px-6 py-4 flex items-center gap-4">
        {/* Número */}
        <div className="w-24 shrink-0">
          <span className="font-mono font-semibold text-sm text-gray-900">{pedido.numero_orden}</span>
          {pedido.es_zombie && (
            <span className="ml-1 text-xs text-orange-500" title="Pedido zombie: más de 30 días pendiente">
              🧟
            </span>
          )}
        </div>

        {/* Cliente */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{pedido.cliente_nombre}</p>
          <p className="text-xs text-gray-500">{formatearTelefono(pedido.cliente_telefono)}</p>
        </div>

        {/* Estado */}
        <div className="w-40 shrink-0">
          <EstadoBadge estado={pedido.estado} enAlerta={pedido.en_alerta} />
        </div>

        {/* Financiero */}
        <div className="w-32 shrink-0 text-right">
          <p className="text-sm font-medium text-gray-900">{formatCOP(pedido.total)}</p>
          {saldo > 0 ? (
            <p className="text-xs text-red-600">Saldo: {formatCOP(saldo)}</p>
          ) : (
            <p className="text-xs text-green-600">Pagado</p>
          )}
        </div>

        {/* Asesor y sede (solo admin) */}
        {esAdmin && (
          <div className="w-32 shrink-0 text-right hidden md:block">
            <p className="text-xs text-gray-600 truncate">{pedido.asesor_nombre}</p>
            <p className="text-xs text-gray-400">{pedido.sede_codigo}</p>
          </div>
        )}

        {/* Fecha */}
        <div className="w-24 shrink-0 text-right hidden lg:block">
          <p className="text-xs text-gray-500">{formatFecha(pedido.fecha_creacion)}</p>
        </div>

        <span className="text-gray-300 ml-2">›</span>
      </div>
    </Link>
  )
}
