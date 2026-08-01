'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcarLlegadaCompraAction } from '@/app/actions/compras'
import { PackageCheck } from 'lucide-react'

// "Llegó todo": cuando la mercancía de la factura llega completa, marca de una
// vez todos los pedidos asignados a la compra en estado 'bucaramanga'.
export function MarcarLlegadaButton({ compraId, pedidosCount }: { compraId: string; pedidosCount: number }) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)

  async function marcar() {
    if (!confirm(
      `¿Llegó TODA la mercancía de esta factura?\n\n` +
      `Los ${pedidosCount} pedido(s) asignados a esta compra pasarán a estado ` +
      `"Bucaramanga" de una sola vez (los ya entregados o en sede no se tocan).`
    )) return
    setCargando(true)
    const r = await marcarLlegadaCompraAction(compraId)
    setCargando(false)
    if (!r.ok) { alert(r.error); return }
    let msg = r.marcados.length > 0
      ? `✅ ${r.marcados.length} pedido(s) marcados en Bucaramanga:\n${r.marcados.join(', ')}`
      : 'Ningún pedido estaba en camino — no se marcó ninguno.'
    if (r.omitidos.length > 0) msg += `\n\nSin tocar (ya estaban en sede/entregados):\n${r.omitidos.join(', ')}`
    alert(msg)
    router.refresh()
  }

  return (
    <button
      onClick={marcar}
      disabled={cargando}
      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
    >
      <PackageCheck size={16} />
      {cargando ? 'Marcando…' : 'Llegó todo'}
    </button>
  )
}
