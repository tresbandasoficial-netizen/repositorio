'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiarEstadoPrendaAction } from '@/app/actions/pedidos'
import { transicionesDisponibles } from '@/lib/domain/estados'
import { ESTADO_COLORES, ESTADO_LABELS, type EstadoPedido } from '@/types'

// Estado de UNA prenda dentro del pedido: cambiarlo no mueve las demás (el
// pedido queda en el estado de su prenda más atrasada). Entregar y cancelar
// siguen siendo del pedido completo.
export function EstadoPrendaSelect({ pedidoId, itemId, estado, esAdmin }: {
  pedidoId: string
  itemId: string
  estado: EstadoPedido
  esAdmin: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const opciones = transicionesDisponibles(estado, esAdmin ? 'admin' : 'asesor')
    .filter(e => e !== 'entregado' && e !== 'cancelado')

  function cambiar(nuevo: EstadoPedido) {
    start(async () => {
      setError(null)
      const r = await cambiarEstadoPrendaAction(pedidoId, itemId, nuevo)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`estado-prenda-${itemId}`}>Estado de esta prenda</label>
      <select
        id={`estado-prenda-${itemId}`}
        value=""
        disabled={pending || opciones.length === 0}
        onChange={e => { const v = e.target.value as EstadoPedido; if (v) cambiar(v) }}
        className={`rounded-md border-0 px-2 py-0.5 text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-default ${ESTADO_COLORES[estado]}`}
        title="Estado de esta prenda — cambiarlo no mueve las demás"
      >
        <option value="">{pending ? 'Cambiando…' : ESTADO_LABELS[estado]}</option>
        {opciones.map(e => (
          <option key={e} value={e}>→ {ESTADO_LABELS[e]}</option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}
