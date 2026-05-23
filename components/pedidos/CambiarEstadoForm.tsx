'use client'

import { useState, useTransition } from 'react'
import { EstadoPedido, ESTADO_LABELS, ESTADO_COLORES } from '@/types'
import { transicionesDisponibles } from '@/lib/domain/estados'
import { cambiarEstadoAction } from '@/app/actions/pedidos'
import { cn } from '@/lib/utils/cn'

interface CambiarEstadoFormProps {
  pedidoId: string
  estadoActual: EstadoPedido
  rol: 'asesor' | 'admin'
}

export function CambiarEstadoForm({ pedidoId, estadoActual, rol }: CambiarEstadoFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<EstadoPedido | null>(null)

  const disponibles = transicionesDisponibles(estadoActual, rol)

  function handleClick(estado: EstadoPedido) {
    if (estado === 'cancelado') {
      setConfirmando(estado)
      return
    }
    ejecutar(estado)
  }

  function ejecutar(estado: EstadoPedido) {
    setError(null)
    startTransition(async () => {
      const result = await cambiarEstadoAction(pedidoId, estadoActual, estado)
      if (!result.ok) {
        setError(result.error)
        setConfirmando(null)
      }
    })
  }

  if (disponibles.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Este pedido está en <strong>{ESTADO_LABELS[estadoActual]}</strong> y no admite más cambios.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Estado actual</p>
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-medium', ESTADO_COLORES[estadoActual])}>
          {ESTADO_LABELS[estadoActual]}
        </span>
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Mover a</p>
        <div className="flex flex-wrap gap-3">
          {disponibles.map((estado) => (
            <button
              key={estado}
              onClick={() => handleClick(estado)}
              disabled={isPending}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50',
                estado === 'cancelado'
                  ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
              )}
            >
              {isPending ? '...' : ESTADO_LABELS[estado]}
            </button>
          ))}
        </div>
      </div>

      {/* Confirmación explícita para cancelar */}
      {confirmando === 'cancelado' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <p className="text-sm text-red-700 font-medium">
            ¿Confirmas que quieres cancelar este pedido? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => ejecutar('cancelado')}
              disabled={isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {isPending ? 'Cancelando...' : 'Sí, cancelar pedido'}
            </button>
            <button
              onClick={() => setConfirmando(null)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              No, volver
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
