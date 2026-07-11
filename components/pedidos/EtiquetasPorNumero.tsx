'use client'

import { useState } from 'react'
import { Tag } from 'lucide-react'

// Campo para imprimir etiquetas escribiendo los números de pedido directamente
// (ej: "TR6564 TR65674"), sin marcarlos uno por uno en la lista.
export function EtiquetasPorNumero() {
  const [texto, setTexto] = useState('')

  function imprimir() {
    const nums = texto.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    if (nums.length === 0) return
    window.open(`/pedidos/etiquetas?nums=${encodeURIComponent(nums.join(','))}`, '_blank')
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); imprimir() } }}
        placeholder="Imprimir etiquetas por número: TR6564 TR65674…"
        className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder:font-sans placeholder-gray-400"
      />
      <button
        onClick={imprimir}
        disabled={!texto.trim()}
        title="Imprimir etiquetas de los números escritos"
        className="shrink-0 flex items-center gap-1.5 text-sm font-bold px-3 py-2.5 rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Tag size={14} />
        <span className="hidden sm:inline">Imprimir</span>
      </button>
    </div>
  )
}
