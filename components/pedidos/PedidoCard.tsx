'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoBadge } from './EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ChevronRight, Loader2 } from 'lucide-react'
import { EstadoPedido, ESTADO_LABELS, ESTADO_COLORES } from '@/types'
import { TRANSICIONES } from '@/lib/domain/estados'
import { cambiarEstadoInlineAction } from '@/app/actions/pedidos'
import { cn } from '@/lib/utils/cn'

function EstadoInline({ pedidoId, estadoActual, sedeCodigo }: { pedidoId: string; estadoActual: EstadoPedido; sedeCodigo: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [estadoLocal, setEstadoLocal] = useState<EstadoPedido>(estadoActual)
  const ref = useRef<HTMLDivElement>(null)

  const esSantaRosa = sedeCodigo === 'SR'
  const disponibles = (TRANSICIONES[estadoLocal] ?? []).filter(e => esSantaRosa || e !== 'santa_rosa')
  const esTerminal = disponibles.length === 0

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handleBadgeClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (esTerminal || isPending) return
    setOpen(o => !o)
  }

  function handleSelect(e: React.MouseEvent, nuevoEstado: EstadoPedido) {
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    startTransition(async () => {
      const result = await cambiarEstadoInlineAction(pedidoId, estadoLocal, nuevoEstado)
      if (result.ok) {
        setEstadoLocal(nuevoEstado)
        router.refresh()
      }
    })
  }

  return (
    <div ref={ref} className="relative" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
      <button
        onClick={handleBadgeClick}
        disabled={esTerminal || isPending}
        className={cn(
          'flex items-center gap-1.5 transition-all',
          !esTerminal && !isPending && 'hover:opacity-80 cursor-pointer'
        )}
        title={esTerminal ? undefined : 'Clic para cambiar estado'}
      >
        {isPending
          ? <Loader2 size={13} className="animate-spin text-gray-400" />
          : <EstadoBadge estado={estadoLocal} enAlerta={false} />
        }
        {!esTerminal && !isPending && (
          <span className="text-gray-300 text-xs">▾</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[150px]">
          {disponibles.map(estado => (
            <button
              key={estado}
              onClick={(e) => handleSelect(e, estado)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 transition-colors"
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0',
                ESTADO_COLORES[estado].replace('bg-', 'bg-').split(' ')[0]
              )} />
              <span className="text-gray-700">{ESTADO_LABELS[estado]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface PedidoCardProps {
  pedido: PedidoRow
  esAdmin: boolean
}

export function PedidoCard({ pedido, esAdmin }: PedidoCardProps) {
  const router = useRouter()
  const saldo = pedido.total - pedido.total_pagado
  const imagen = (pedido as any).primera_imagen as string | null

  function handleCardClick() {
    router.push(`/pedidos/${pedido.id}`)
  }

  return (
    <div onClick={handleCardClick} className="cursor-pointer hover:bg-gray-50/60 transition-colors">
      {/* Móvil */}
      <div className="md:hidden px-4 py-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {imagen && (
              <img src={imagen} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-200 shrink-0" />
            )}
            <span className="font-mono font-bold text-sm text-gray-900">{pedido.numero_orden}</span>
            {pedido.es_zombie && <span className="text-xs text-orange-500" title="Pedido zombie">🧟</span>}
          </div>
          <EstadoInline pedidoId={pedido.id} estadoActual={pedido.estado} sedeCodigo={pedido.sede_codigo} />
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
        <div className="w-24 shrink-0 flex items-center gap-2">
          {imagen && (
            <img src={imagen} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200 shrink-0" />
          )}
          <div>
            <span className="font-mono font-bold text-sm text-gray-900">{pedido.numero_orden}</span>
            {pedido.es_zombie && (
              <span className="ml-1 text-xs text-orange-500" title="Pedido zombie: más de 30 días pendiente">🧟</span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{pedido.cliente_nombre}</p>
          <p className="text-xs text-gray-400">{formatearTelefono(pedido.cliente_telefono)}</p>
        </div>
        <div className="w-40 shrink-0">
          <EstadoInline pedidoId={pedido.id} estadoActual={pedido.estado} sedeCodigo={pedido.sede_codigo} />
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
    </div>
  )
}
