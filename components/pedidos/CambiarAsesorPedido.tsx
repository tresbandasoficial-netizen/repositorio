'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiarAsesorPedidoAction } from '@/app/actions/pedidos'

type Asesor = { id: string; nombre: string }

// Asesor del pedido con lápiz para cambiarlo (solo lo ve el admin). Igual al
// de facturas: corrige pedidos registrados bajo el asesor equivocado para que
// el ranking y las metas del mes le cuenten la venta al asesor correcto.
export function CambiarAsesorPedido({
  pedidoId,
  asesorId,
  asesorNombre,
  asesores,
}: {
  pedidoId: string
  asesorId: string | null
  asesorNombre: string
  asesores: Asesor[]
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [seleccion, setSeleccion] = useState(asesorId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, start] = useTransition()

  function guardar() {
    setError(null)
    start(async () => {
      const r = await cambiarAsesorPedidoAction(pedidoId, seleccion)
      if (!r.ok) { setError(r.error); return }
      setEditando(false)
      router.refresh()
    })
  }

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1">
        {asesorNombre}
        <button
          onClick={() => setEditando(true)}
          className="text-blue-500 hover:text-blue-700"
          title="Cambiar el asesor de este pedido"
        >
          ✏️
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap justify-end">
      <select
        value={seleccion}
        onChange={e => setSeleccion(e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Asesor…</option>
        {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
      </select>
      <button
        onClick={guardar}
        disabled={guardando || !seleccion}
        className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2.5 py-1 disabled:opacity-50"
      >
        {guardando ? '…' : 'Guardar'}
      </button>
      <button onClick={() => setEditando(false)} className="text-xs text-gray-400 hover:text-gray-600">
        Cancelar
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
