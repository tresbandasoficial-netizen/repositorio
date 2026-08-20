'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Panel oculto por defecto tras un botón (pedido de Johan 20-ago-2026 para los
// resúmenes de /compras): el contenido solo se muestra al abrirlo.
export function PanelColapsable({ titulo, children }: {
  titulo: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
          abierto
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {titulo}
      </button>
      {abierto && <div className="mt-3">{children}</div>}
    </div>
  )
}
