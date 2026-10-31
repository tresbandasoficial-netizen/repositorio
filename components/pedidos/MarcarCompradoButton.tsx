'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { marcarCompradoSinFacturaAction } from '@/app/actions/pedidos'
import { useAviso } from '@/components/ui/Aviso'

// En el detalle del pedido: avisar "ya se compró" sin factura ni valor de
// compra. Si ya está marcado, deja quitar la marca.
export function MarcarCompradoButton({ pedidoId, marcado }: { pedidoId: string; marcado: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { avisar } = useAviso()

  function aplicar(marcar: boolean) {
    start(async () => {
      setError(null)
      const r = await marcarCompradoSinFacturaAction([pedidoId], marcar)
      if (!r.ok) { setError(r.error); return }
      avisar(marcar ? 'Pedido marcado como comprado' : 'Marca de comprado quitada')
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      {marcado ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
          <span className="text-xs font-semibold text-emerald-700">🧾 Sin factura registrada</span>
          <button onClick={() => aplicar(false)} disabled={pending} className="text-xs text-gray-500 underline disabled:opacity-50">
            Quitar
          </button>
        </div>
      ) : (
        <button
          onClick={() => aplicar(true)}
          disabled={pending}
          title="Avisar que ya se compró, sin poner factura ni valor"
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold px-3 py-2 transition-colors disabled:opacity-50"
        >
          <ShoppingCart size={14} />
          {pending ? 'Marcando…' : 'Marcar comprado (sin factura registrada)'}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
