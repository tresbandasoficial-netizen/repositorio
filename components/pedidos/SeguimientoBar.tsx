'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { EstadoPedido, ESTADO_LABELS } from '@/types'
import { FLUJO_ESTADOS } from '@/lib/domain/estados'
import { cambiarEstadoAction } from '@/app/actions/pedidos'

interface SeguimientoBarProps {
  pedidoId: string
  estadoActual: EstadoPedido
  rolUsuario: 'asesor' | 'admin' | 'visor'
  sedeCodigo: string
}

export function SeguimientoBar({ pedidoId, estadoActual, rolUsuario, sedeCodigo }: SeguimientoBarProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [loadingEstado, setLoadingEstado] = useState<EstadoPedido | null>(null)

  const esSantaRosa = sedeCodigo === 'SR'
  const flujo = esSantaRosa ? FLUJO_ESTADOS : FLUJO_ESTADOS.filter(e => e !== 'santa_rosa')

  const esTerminal = estadoActual === 'entregado' || estadoActual === 'cancelado'
  const esVisor = rolUsuario === 'visor'

  const pasoActual = flujo.indexOf(estadoActual)

  async function handleCambiar(nuevoEstado: EstadoPedido) {
    if (esVisor || isPending) return
    setError(null)
    setLoadingEstado(nuevoEstado)
    startTransition(async () => {
      const result = await cambiarEstadoAction(pedidoId, estadoActual, nuevoEstado)
      if (!result.ok) {
        setError(result.error)
        setLoadingEstado(null)
      }
      // on success, the server action redirects
    })
  }

  if (estadoActual === 'cancelado') {
    return (
      <div className="px-4 py-3 rounded-xl bg-gray-100 text-center">
        <span className="text-sm font-medium text-gray-500">Pedido cancelado</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stepper */}
      <div className="flex items-start gap-0">
        {flujo.map((estado, i) => {
          const esActual = estado === estadoActual
          const esPasado = pasoActual > i
          const esFuturo = pasoActual < i
          const esUltimo = i === flujo.length - 1

          return (
            <div key={estado} className="flex-1 flex flex-col items-center gap-1.5 relative">
              {/* Línea conectora izquierda */}
              {i > 0 && (
                <div
                  className={`absolute top-[14px] right-1/2 w-full h-0.5 -translate-y-px ${
                    esPasado || esActual ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Círculo / icono */}
              <button
                onClick={() => !esTerminal && !esVisor && !esPasado && !esActual && handleCambiar(estado)}
                disabled={esVisor || esTerminal || esPasado || esActual || isPending}
                title={esFuturo && !esTerminal ? `Mover a ${ESTADO_LABELS[estado]}` : undefined}
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all
                  ${esPasado ? 'bg-blue-500 text-white' : ''}
                  ${esActual ? 'bg-blue-600 text-white ring-4 ring-blue-100' : ''}
                  ${esFuturo && !esVisor && !esTerminal ? 'bg-white border-2 border-gray-200 text-gray-300 hover:border-blue-400 hover:text-blue-400 cursor-pointer' : ''}
                  ${esFuturo && (esVisor || esTerminal) ? 'bg-white border-2 border-gray-200 text-gray-300 cursor-default' : ''}
                  disabled:cursor-default
                `}
              >
                {loadingEstado === estado ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : esPasado ? (
                  <CheckCircle2 size={14} />
                ) : esActual ? (
                  <span className="w-2 h-2 rounded-full bg-white" />
                ) : (
                  <Circle size={14} />
                )}
              </button>

              {/* Label */}
              <span className={`text-center text-[10px] leading-tight font-medium
                ${esActual ? 'text-blue-700' : esPasado ? 'text-blue-500' : 'text-gray-400'}
              `}>
                {ESTADO_LABELS[estado]}
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}

      {/* Botón cancelar (solo si no es terminal y no es visor) */}
      {!esTerminal && !esVisor && (
        <div className="pt-1 border-t border-gray-100">
          {confirmCancel ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 flex-1">¿Cancelar pedido?</span>
              <button
                onClick={() => handleCambiar('cancelado')}
                disabled={isPending}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={11} className="animate-spin" /> : 'Sí, cancelar'}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors w-full text-center py-1"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      )}
    </div>
  )
}
