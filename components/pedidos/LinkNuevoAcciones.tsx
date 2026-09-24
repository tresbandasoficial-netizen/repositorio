'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'

// Copiar / compartir un link de cliente nuevo. No hay celular todavía, así
// que WhatsApp abre el selector de contacto con el mensaje ya escrito.
export function LinkNuevoAcciones({ url, compacto }: { url: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      setError('No se pudo copiar — selecciona el link a mano')
    }
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(`¡Hola! Aquí está tu pedido con Tres Bandas. Llena tus datos aquí 👉 ${url}`)}`
  const base = compacto ? 'px-2 py-1 text-[11px]' : 'px-2 py-1.5 text-[11px]'

  return (
    <div className="flex gap-1.5 items-center">
      <button
        type="button"
        onClick={copiar}
        className={`inline-flex items-center justify-center gap-1 rounded-md border border-violet-300 bg-white font-bold text-violet-700 hover:bg-violet-100 transition-colors ${base}`}
      >
        <Copy size={11} /> {copiado ? '✓ Copiado' : 'Copiar'}
      </button>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center gap-1 rounded-md bg-green-600 font-bold text-white hover:bg-green-700 transition-colors ${base}`}
      >
        📲 WhatsApp
      </a>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  )
}
