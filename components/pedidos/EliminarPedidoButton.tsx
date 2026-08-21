'use client'

import { useState, useTransition } from 'react'
import { eliminarPedidoAction } from '@/app/actions/pedidos'

export function EliminarPedidoButton({ pedidoId }: { pedidoId: string }) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleEliminar() {
    startTransition(async () => {
      const result = await eliminarPedidoAction(pedidoId)
      if (!result.ok) setError(result.error)
    })
  }

  if (confirmando) {
    return (
      <div className="flex flex-col items-end gap-2">
        {/* El candado del servidor puede devolver una explicación larga
            (abonos reales / pedido facturado): se muestra en bloque. */}
        {error && (
          <p className="max-w-md text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-left">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">¿Eliminar este pedido?</span>
        <button
          onClick={handleEliminar}
          disabled={isPending}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {isPending ? 'Eliminando...' : 'Sí, eliminar'}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          disabled={isPending}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors"
        >
          Cancelar
        </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="text-sm bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
    >
      Eliminar
    </button>
  )
}
