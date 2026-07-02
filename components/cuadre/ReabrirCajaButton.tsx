'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reabrirCajaAction } from '@/app/actions/cierres'

// Chip para admin: muestra una sede con caja cerrada hoy y permite reabrirla.
// Al reabrir, los asesores de esa sede vuelven a poder registrar movimientos.
export function ReabrirCajaButton({
  sedeId,
  sedeNombre,
  automatico = false,
}: {
  sedeId: string
  sedeNombre: string
  automatico?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  function reabrir() {
    if (!confirm(`¿Reabrir la caja de ${sedeNombre}? Los asesores podrán volver a registrar movimientos hoy.`)) return
    start(async () => {
      const r = await reabrirCajaAction({ sede_id: sedeId })
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">
      <span className="font-medium text-amber-800">
        🔒 {sedeNombre} cerrada{automatico ? ' (auto)' : ''}
      </span>
      <button
        onClick={reabrir}
        disabled={pending}
        className="rounded-md bg-amber-600 text-white px-2 py-0.5 font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? '…' : 'Reabrir'}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  )
}
