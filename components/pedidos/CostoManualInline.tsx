'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { asignarCostoManualAction } from '@/app/actions/pedidos'
import { formatCOP, formatMiles } from '@/lib/utils/format'
import { Loader2, Pencil } from 'lucide-react'

// Editor del costo manual del pedido (solo admin). Si hay costo manual,
// la ganancia se calcula con ese valor; quitarlo vuelve al costo automático
// (compras asignadas / salida de inventario).
export function CostoManualInline({ pedidoId, costoManual }: {
  pedidoId: string
  costoManual: number | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(costoManual != null ? String(costoManual) : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function guardar(costo: number | null) {
    start(async () => {
      setError(null)
      try {
        const r = await asignarCostoManualAction(pedidoId, costo)
        if (!r.ok) { setError(r.error); return }
        setEditando(false)
        router.refresh()
      } catch (e) {
        console.error(e)
        setError('Recarga la página e intenta de nuevo')
      }
    })
  }

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {costoManual != null && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">manual</span>
        )}
        <button
          onClick={() => { setValor(costoManual != null ? String(costoManual) : ''); setEditando(true); setError(null) }}
          title={costoManual != null ? 'Editar costo manual' : 'Poner costo manual'}
          className="text-gray-400 hover:text-blue-600 transition-colors"
        >
          <Pencil size={12} />
        </button>
      </span>
    )
  }

  const num = parseInt(valor.replace(/\D/g, ''), 10)

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={formatMiles(valor)}
            onChange={e => setValor(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (!isNaN(num) && num >= 0) guardar(num) }
              if (e.key === 'Escape') setEditando(false)
            }}
            placeholder="0"
            className="w-28 pl-5 pr-2 py-1 rounded-lg border border-blue-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </span>
        <button
          onClick={() => { if (!isNaN(num) && num >= 0) guardar(num) }}
          disabled={pending || isNaN(num)}
          className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-2 py-1 disabled:opacity-40"
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : 'OK'}
        </button>
        <button onClick={() => setEditando(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </span>
      {costoManual != null && (
        <button
          onClick={() => guardar(null)}
          disabled={pending}
          className="text-[10px] text-gray-400 hover:text-red-500 underline"
        >
          Quitar costo manual (volver al automático{costoManual != null ? `, hoy ${formatCOP(costoManual)}` : ''})
        </button>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  )
}
