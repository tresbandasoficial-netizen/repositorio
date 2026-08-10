'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiarAsesorFacturaAction } from '@/app/actions/facturacion'

type Asesor = { id: string; nombre: string }

// Asesor de la factura con lápiz para cambiarlo (solo lo ve el admin). Al
// cambiar, la venta local de la factura también pasa al asesor nuevo — el
// ranking y las metas del mes quedan bien.
export function CambiarAsesorFactura({
  facturaId,
  asesorId,
  asesorNombre,
  asesores,
}: {
  facturaId: string
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
      const r = await cambiarAsesorFacturaAction(facturaId, seleccion)
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
          title="Cambiar el asesor de esta factura"
        >
          ✏️
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
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
