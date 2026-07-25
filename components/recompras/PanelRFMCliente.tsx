'use client'

import { formatCOP } from '@/lib/utils/format'

interface RFMData {
  diasDesdeUltimaCompra?: number | null
  frecuencia?: number | null
  montoTotal?: number | null
}

export function PanelRFMCliente({ r, f, m }: { r?: number | null; f?: number | null; m?: number | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      {/* Recencia */}
      <div className="flex flex-col items-center">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recencia</div>
        <div className="mt-1 text-xl font-bold text-gray-900">{r ?? '—'}</div>
        <div className="text-xs text-gray-600">días</div>
      </div>

      {/* Frecuencia */}
      <div className="flex flex-col items-center border-x border-gray-200">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Frecuencia</div>
        <div className="mt-1 text-xl font-bold text-gray-900">{f ?? '—'}</div>
        <div className="text-xs text-gray-600">compras</div>
      </div>

      {/* Monetario */}
      <div className="flex flex-col items-center">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monetario</div>
        <div className="mt-1 text-sm font-bold text-gray-900">
          {m ? `$${(m / 1000000).toFixed(1)}M` : '—'}
        </div>
        <div className="text-xs text-gray-600">COP</div>
      </div>
    </div>
  )
}
