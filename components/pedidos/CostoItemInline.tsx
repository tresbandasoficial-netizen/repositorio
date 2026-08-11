'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { asignarCostoItemAction } from '@/app/actions/pedidos'
import { formatCOP, formatMiles } from '@/lib/utils/format'
import { Loader2, Pencil } from 'lucide-react'

// Editor del costo manual de UN producto del pedido (solo admin), en la tabla
// de productos del detalle. El costo es POR UNIDAD; si la cantidad es más de 1
// se muestra el total de la línea al lado.
export function CostoItemInline({ itemId, costoManual, cantidad }: {
  itemId: string
  costoManual: number | null
  cantidad: number
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
        const r = await asignarCostoItemAction(itemId, costo)
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
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {costoManual != null
          ? (
            <span className="text-gray-700">
              {formatCOP(costoManual)}
              {cantidad > 1 && <span className="text-xs text-gray-400"> ×{cantidad}</span>}
            </span>
          )
          : <span className="text-xs text-gray-300">—</span>}
        <button
          onClick={() => { setValor(costoManual != null ? String(costoManual) : ''); setEditando(true); setError(null) }}
          title={costoManual != null ? 'Editar costo del producto' : 'Poner costo al producto'}
          className="text-gray-400 hover:text-blue-600 transition-colors"
        >
          <Pencil size={12} />
        </button>
      </span>
    )
  }

  const num = parseInt(valor.replace(/\D/g, ''), 10)

  // En vertical: la columna de la tabla es angosta y en fila los botones
  // quedaban montados encima del precio.
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
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
          className="w-24 pl-5 pr-2 py-1 rounded-lg border border-blue-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </span>
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => setEditando(false)}
          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        >
          ✕
        </button>
        <button
          onClick={() => { if (!isNaN(num) && num >= 0) guardar(num) }}
          disabled={pending || isNaN(num)}
          className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1 disabled:opacity-40"
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : 'OK'}
        </button>
      </span>
      {costoManual != null && (
        <button
          onClick={() => guardar(null)}
          disabled={pending}
          className="text-[10px] text-gray-400 hover:text-red-500 underline"
        >
          Quitar costo
        </button>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  )
}
