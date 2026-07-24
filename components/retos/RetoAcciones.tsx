'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cerrarRetoAction, reabrirRetoAction, eliminarRetoAction } from '@/app/actions/retos'

// Botones de admin sobre un reto. Cerrar lo saca del aviso flotante pero
// conserva el historial; eliminar sí lo borra (pide confirmación).
export function RetoAcciones({ retoId, activo }: { retoId: string; activo: boolean }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pendiente, startTransition] = useTransition()

  function correr(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError('')
    startTransition(async () => {
      const res = await accion()
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {activo ? (
        <button
          type="button" disabled={pendiente}
          onClick={() => correr(() => cerrarRetoAction(retoId))}
          className="text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Cerrar reto
        </button>
      ) : (
        <button
          type="button" disabled={pendiente}
          onClick={() => correr(() => reabrirRetoAction(retoId))}
          className="text-xs font-semibold text-violet-700 border border-violet-300 rounded-lg px-2.5 py-1 hover:bg-violet-50 disabled:opacity-40 transition-colors"
        >
          Reabrir
        </button>
      )}
      <button
        type="button" disabled={pendiente}
        onClick={() => {
          if (!window.confirm('¿Eliminar este reto? Se borra del todo, no queda en el historial.')) return
          correr(() => eliminarRetoAction(retoId))
        }}
        className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 disabled:opacity-40 transition-colors"
      >
        Eliminar
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
