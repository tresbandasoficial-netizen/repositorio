'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { marcarEtiquetadoAction } from '@/app/actions/clientes'
import { useAviso } from '@/components/ui/Aviso'
import { PanelRFMCliente } from './PanelRFMCliente'

export type ClienteFila = {
  id: string
  nombre: string
  telefono: string
  r: number | null
  f: number | null
  m: number | null
  etiquetado: string | null
}

// Una fila de la lista de etiquetado: abre el chat de WhatsApp, y al volver se
// marca listo. La marca solo registra el avance del trabajo manual — las
// etiquetas de WhatsApp Business no se pueden poner desde afuera.
export function FilaEtiquetar({ cliente, soloLectura = false }: { cliente: ClienteFila; soloLectura?: boolean }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [pending, start] = useTransition()
  const listo = cliente.etiquetado != null

  function alternar() {
    start(async () => {
      const r = await marcarEtiquetadoAction(cliente.id, !listo)
      if (!r.ok) { avisarError(r.error); return }
      avisar(listo ? 'Marca quitada' : 'Etiquetado')
      router.refresh()
    })
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${listo ? 'bg-gray-50/70' : 'hover:bg-gray-50'}`}>
      {!soloLectura && (
        <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={listo}
            onChange={alternar}
            disabled={pending}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-gray-400 w-14">{listo ? 'Listo' : 'Falta'}</span>
        </label>
      )}

      <Link href={`/clientes/${cliente.id}`} className="flex-1 min-w-[11rem] group">
        <div className={`font-medium truncate ${listo ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-blue-700'}`}>
          {cliente.nombre}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 font-mono">{cliente.telefono}</div>
      </Link>

      <PanelRFMCliente r={cliente.r} f={cliente.f} m={cliente.m} />

      {cliente.telefono && (
        <a
          href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          Abrir chat
        </a>
      )}
    </div>
  )
}

// Copia al portapapeles el nombre de la etiqueta, para no escribirlo distinto
// en cada celular.
export function CopiarEtiqueta({ texto }: { texto: string }) {
  const { avisar, avisarError } = useAviso()
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      avisar('Nombre de etiqueta copiado')
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      avisarError('El navegador no dejó copiar. Escríbela a mano: ' + texto)
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar "${texto}" para pegarlo en WhatsApp`}
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
    >
      {copiado ? '✓ Copiado' : 'Copiar nombre'}
    </button>
  )
}
