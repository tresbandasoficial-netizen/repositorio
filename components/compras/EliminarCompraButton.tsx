'use client'

import { useState, useTransition } from 'react'
import { eliminarCompraAction } from '@/app/actions/compras'

export function EliminarCompraButton({ compraId }: { compraId: string }) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleEliminar() {
    startTransition(async () => {
      const result = await eliminarCompraAction(compraId)
      if (!result.ok) setError(result.error)
    })
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <span className="text-xs text-gray-500">¿Eliminar esta factura?</span>
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
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors"
    >
      Eliminar factura
    </button>
  )
}
