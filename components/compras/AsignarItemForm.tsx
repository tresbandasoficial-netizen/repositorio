'use client'

import { useState, useTransition } from 'react'
import { asignarItemAction } from '@/app/actions/compras'
import { Button } from '@/components/ui/Button'

type Destino = 'pedido' | 'contoda' | 'sin_asignar'

interface AsignarItemFormProps {
  itemId: string
  destinoActual: Destino
  pedidoActual: string | null
  onDone?: () => void
}

export function AsignarItemForm({ itemId, destinoActual, pedidoActual, onDone }: AsignarItemFormProps) {
  const [destino, setDestino] = useState<Destino>(destinoActual)
  const [numeroPedido, setNumeroPedido] = useState(pedidoActual ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGuardar() {
    setError(null)

    startTransition(async () => {
      const result = await asignarItemAction(
        itemId,
        destino,
        destino === 'pedido' ? numeroPedido : undefined
      )

      if (!result.ok) {
        setError(result.error)
      } else {
        onDone?.()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(['sin_asignar', 'pedido', 'contoda'] as Destino[]).map((op) => (
          <label key={op} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name={`destino-${itemId}`}
              value={op}
              checked={destino === op}
              onChange={() => setDestino(op)}
              className="accent-blue-600"
            />
            <span className="text-sm text-gray-700">
              {op === 'sin_asignar' && 'Sin asignar'}
              {op === 'pedido' && 'Asignar a pedido'}
              {op === 'contoda' && 'Para Contoda'}
            </span>
          </label>
        ))}
      </div>

      {destino === 'pedido' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Número de orden</label>
          <input
            type="text"
            value={numeroPedido}
            onChange={(e) => setNumeroPedido(e.target.value.toUpperCase())}
            placeholder="TR1025 o TR1025-1"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Si el pedido tiene varios artículos usa TR1025-1, TR1025-2, etc.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleGuardar}
          disabled={isPending}
          size="sm"
        >
          {isPending ? 'Guardando...' : 'Guardar'}
        </Button>
        {onDone && (
          <Button
            onClick={onDone}
            variant="secondary"
            size="sm"
            disabled={isPending}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
