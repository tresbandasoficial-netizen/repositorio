'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcarLlegadaCompraAction } from '@/app/actions/compras'
import { PackageCheck } from 'lucide-react'

// "Llegó todo": cuando la mercancía de la factura llega a Bucaramanga, marca
// los pedidos asignados en estado 'bucaramanga' Y carga al stock los items sin
// pedido (desde la mig. 176 el stock entra aquí, no al registrar la compra).
export function MarcarLlegadaButton({ compraId, pedidosCount, stockCount, yaLlego }: {
  compraId: string
  pedidosCount: number
  stockCount: number
  yaLlego: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)

  async function marcar() {
    const partes = [
      pedidosCount > 0 ? `• ${pedidosCount} pedido(s) pasarán a "Bucaramanga" (los ya entregados o en sede no se tocan).` : null,
      stockCount > 0 ? `• ${stockCount} producto(s) sin pedido entrarán al stock de Bucaramanga con su costo.` : null,
    ].filter(Boolean).join('\n')
    if (!confirm(`¿Llegó TODA la mercancía de esta factura?\n\n${partes || 'No hay pedidos ni sobrantes pendientes — solo se registra la llegada.'}`)) return
    setCargando(true)
    const r = await marcarLlegadaCompraAction(compraId)
    setCargando(false)
    if (!r.ok) { alert(r.error); return }
    const lineas: string[] = []
    if (r.marcados.length > 0) lineas.push(`✅ ${r.marcados.length} pedido(s) en Bucaramanga: ${r.marcados.join(', ')}`)
    if (r.stock > 0) lineas.push(`📦 ${r.stock} unidad(es) cargadas al stock de Bucaramanga`)
    if (r.omitidos.length > 0) lineas.push(`Sin tocar (ya estaban en sede/entregados): ${r.omitidos.join(', ')}`)
    if (r.sinFicha.length > 0) lineas.push(`⚠️ Sin ficha de catálogo (no entraron al stock): ${r.sinFicha.join(', ')}`)
    alert(lineas.join('\n\n') || 'Llegada registrada — no había nada pendiente por mover.')
    router.refresh()
  }

  return (
    <button
      onClick={marcar}
      disabled={cargando}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
        yaLlego
          ? 'border border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
          : 'bg-green-600 text-white hover:bg-green-700'
      }`}
      title={yaLlego ? 'La llegada ya está registrada; puedes repetirlo si agregaste productos (no duplica nada)' : 'Marcar que la mercancía llegó a Bucaramanga'}
    >
      <PackageCheck size={16} />
      {cargando ? 'Marcando…' : yaLlego ? '✓ Llegó' : 'Llegó todo'}
    </button>
  )
}
