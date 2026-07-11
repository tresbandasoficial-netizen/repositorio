'use client'

import { useState, useTransition } from 'react'
import { marcarLlegadaBucaramangaAction } from '@/app/actions/pedidos'
import { Loader2, PackageCheck, Check } from 'lucide-react'

// En la página de etiquetas: marca todos los pedidos impresos como llegados
// a Bucaramanga (estado 'bucaramanga'). La etiqueta se imprime cuando la
// mercancía llega, así que este botón cierra ese paso del flujo.
export function MarcarLlegadaButton({ pedidoIds }: { pedidoIds: string[] }) {
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ marcados: number; omitidos: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm(`¿Marcar ${pedidoIds.length} pedido${pedidoIds.length !== 1 ? 's' : ''} como llegado${pedidoIds.length !== 1 ? 's' : ''} a Bucaramanga?`)) return
    startTransition(async () => {
      setError(null)
      const r = await marcarLlegadaBucaramangaAction(pedidoIds)
      if (r.ok) setResultado({ marcados: r.marcados, omitidos: r.omitidos })
      else setError(r.error)
    })
  }

  if (resultado) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg">
          <Check size={15} /> {resultado.marcados} en Bucaramanga
        </span>
        {resultado.omitidos.length > 0 && (
          <span className="text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-2 py-1 max-w-xs text-right">
            Sin cambio: {resultado.omitidos.join(', ')}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-60"
      >
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />}
        Llegó a Bucaramanga ({pedidoIds.length})
      </button>
      {error && (
        <span className="text-xs bg-red-50 border border-red-300 text-red-700 rounded-lg px-2 py-1">{error}</span>
      )}
    </div>
  )
}
