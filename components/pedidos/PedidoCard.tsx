import Link from 'next/link'
import { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoBadge } from './EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ChevronRight } from 'lucide-react'

interface PedidoCardProps {
  pedido: PedidoRow
  esAdmin: boolean
}

export function PedidoCard({ pedido, esAdmin }: PedidoCardProps) {
  const saldo = pedido.total - pedido.total_pagado

  return (
    <Link href={`/pedidos/${pedido.id}`} className="block hover:bg-gray-50/60 transition-colors">
      {/* Móvil */}
      <div className="md:hidden px-4 py-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-gray-900">{pedido.numero_orden}</span>
            {pedido.es_zombie && <span className="text-xs text-orange-500" title="Pedido zombie">🧟</span>}
          </div>
          <EstadoBadge estado={pedido.estado} enAlerta={pedido.en_alerta} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{pedido.cliente_nombre}</p>
            <p className="text-xs text-gray-400">{formatearTelefono(pedido.cliente_telefono)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900">{formatCOP(pedido.total)}</p>
            {saldo > 0 ? (
              <p className="text-xs text-red-500 font-medium">Saldo: {formatCOP(saldo)}</p>
            ) : (
              <p className="text-xs text-emerald-600 font-medium">Pagado ✓</p>
            )}
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex px-6 py-4 items-center gap-4">
        <div className="w-24 shrink-0">
          <span className="font-mono font-bold text-sm text-gray-900">{pedido.numero_orden}</span>
          {pedido.es_zombie && (
            <span className="ml-1 text-xs text-orange-500" title="Pedido zombie: más de 30 días pendiente">🧟</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{pedido.cliente_nombre}</p>
          <p className="text-xs text-gray-400">{formatearTelefono(pedido.cliente_telefono)}</p>
        </div>
        <div className="w-40 shrink-0">
          <EstadoBadge estado={pedido.estado} enAlerta={pedido.en_alerta} />
        </div>
        <div className="w-32 shrink-0 text-right">
          <p className="text-sm font-bold text-gray-900">{formatCOP(pedido.total)}</p>
          {saldo > 0 ? (
            <p className="text-xs text-red-500 font-medium">Saldo: {formatCOP(saldo)}</p>
          ) : (
            <p className="text-xs text-emerald-600 font-medium">Pagado</p>
          )}
        </div>
        {esAdmin && (
          <div className="w-32 shrink-0 text-right">
            <p className="text-xs font-medium text-gray-600 truncate">{pedido.asesor_nombre}</p>
            <p className="text-xs text-gray-400">{pedido.sede_codigo}</p>
          </div>
        )}
        <div className="w-24 shrink-0 text-right hidden lg:block">
          <p className="text-xs text-gray-400">{formatFecha(pedido.fecha_creacion)}</p>
        </div>
        <ChevronRight size={14} className="text-gray-300 ml-1 shrink-0" />
      </div>
    </Link>
  )
}
