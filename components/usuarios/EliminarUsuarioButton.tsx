'use client'

import { useState, useTransition } from 'react'
import { eliminarUsuarioAction } from '@/app/actions/usuarios'

export function EliminarUsuarioButton({ usuarioId }: { usuarioId: string }) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleEliminar() {
    startTransition(async () => {
      const result = await eliminarUsuarioAction(usuarioId)
      if (result && !result.ok) setError(result.error)
    })
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-2 justify-end">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <span className="text-xs text-gray-500">¿Eliminar?</span>
        <button
          onClick={handleEliminar}
          disabled={isPending}
          className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {isPending ? '...' : 'Sí'}
        </button>
        <button
          onClick={() => { setConfirmando(false); setError(null) }}
          disabled={isPending}
          className="px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="text-xs font-medium px-3 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-colors ml-2"
    >
      Eliminar
    </button>
  )
}
