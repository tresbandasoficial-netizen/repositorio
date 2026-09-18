'use client'

import { useRef, useState, useTransition } from 'react'
import { asignarItemAction } from '@/app/actions/compras'
import { Button } from '@/components/ui/Button'
import { useAviso } from '@/components/ui/Aviso'

type Destino = 'pedido' | 'contoda' | 'sin_asignar'

interface AsignarItemFormProps {
  itemId: string
  destinoActual: Destino
  pedidoActual: string | null
  // Unidades de la fila. Con más de 1, al asignar se puede escoger cuántas van
  // (la fila se divide y el resto queda como está).
  cantidad?: number
  onDone?: () => void
}

export function AsignarItemForm({ itemId, destinoActual, pedidoActual, cantidad = 1, onDone }: AsignarItemFormProps) {
  const [destino, setDestino] = useState<Destino>(destinoActual)
  const [numeroPedido, setNumeroPedido] = useState(pedidoActual ?? '')
  const [unidadesTxt, setUnidadesTxt] = useState(String(cantidad))
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { avisar, avisarError } = useAviso()

  const puedeDividir = cantidad > 1 && destino !== 'sin_asignar'
  // Solo dígitos: parseInt aceptaría "2.5" como 2 o "1e2" como 1 y se enviaría
  // un número distinto al que la persona escribió.
  const unidadesValidas = /^\d+$/.test(unidadesTxt.trim())
  const unidades = unidadesValidas ? parseInt(unidadesTxt.trim(), 10) : NaN

  // isPending tarda un render en ponerse: dos clics seguidos encolarían DOS
  // transiciones y la segunda dividiría/asignaría otra vez. El ref corta el
  // segundo clic de inmediato.
  const enviandoRef = useRef(false)

  function handleGuardar() {
    if (enviandoRef.current) return
    setError(null)

    if (puedeDividir && (!unidadesValidas || unidades < 1 || unidades > cantidad)) {
      setError(`Las unidades deben ser un número entero entre 1 y ${cantidad}`)
      return
    }

    enviandoRef.current = true
    startTransition(async () => {
      try {
        const result = await asignarItemAction(
          itemId,
          destino,
          destino === 'pedido' ? numeroPedido : undefined,
          puedeDividir ? unidades : undefined
        )

        if (!result.ok) {
          setError(result.error)
          avisarError(result.error)
        } else if (result.aviso) {
          // Se asignó, pero lo comprado no es lo que el pedido pide: se queda en
          // pantalla para poder leerlo y decidir, sin cerrar el formulario.
          avisar('Cambio realizado')
          setAviso(result.aviso)
        } else {
          avisar('Cambio realizado')
          onDone?.()
        }
      } finally {
        enviandoRef.current = false
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

      {/* Con varias unidades en la fila se escoge cuántas van al destino: si
          son menos que todas, la fila se divide y el resto queda como está. */}
      {puedeDividir && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            ¿Cuántas unidades? (la fila tiene {cantidad})
          </label>
          <input
            type="number"
            min={1}
            max={cantidad}
            value={unidadesTxt}
            onChange={(e) => setUnidadesTxt(e.target.value)}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {Number.isInteger(unidades) && unidades >= 1 && unidades < cantidad && (
            <p className="text-xs text-amber-700 mt-1">
              ✂️ La fila se divide: {unidades} unidad{unidades !== 1 ? 'es' : ''} {destino === 'pedido' ? 'al pedido' : 'para Contoda'} y {cantidad - unidades} quedan como están.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {aviso && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">Ojo: no es el mismo artículo</p>
          <p className="mt-0.5 text-xs text-amber-800">{aviso}</p>
          <button
            type="button"
            onClick={() => { setAviso(null); onDone?.() }}
            className="mt-1.5 text-xs font-medium text-amber-900 underline hover:no-underline"
          >
            Entendido, cerrar
          </button>
        </div>
      )}

      {/* Con el aviso en pantalla el cambio YA quedó guardado: se esconde el
          botón para que repetir Guardar no divida/asigne otra vez (la acción
          dejó de ser idempotente con la división por unidades). */}
      {!aviso && (
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
      )}
    </div>
  )
}
