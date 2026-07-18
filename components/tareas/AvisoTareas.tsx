'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { completarTareaAction } from '@/app/actions/tareas'
import { ClipboardList, Check, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react'

export type TareaPendiente = {
  id: string
  titulo: string
  descripcion: string | null
}

// Aviso flotante en la parte de abajo de la pantalla, visible en TODAS las
// páginas: le recuerda al asesor sus tareas pendientes como si fuera un
// mensaje. Se puede minimizar a una burbuja con el contador.
export function AvisoTareas({ tareas }: { tareas: TareaPendiente[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(true)
  const [ocultas, setOcultas] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const visibles = tareas.filter(t => !ocultas.includes(t.id))
  if (visibles.length === 0) return null

  function completar(id: string) {
    setError('')
    setPendingId(id)
    startTransition(async () => {
      try {
        const res = await completarTareaAction(id)
        if (res.ok) {
          setOcultas(prev => [...prev, id])
          router.refresh()
        } else {
          setError(res.error)
        }
      } catch {
        setError('No se pudo guardar. Recarga la página (F5) e intenta de nuevo.')
      }
      setPendingId(null)
    })
  }

  // Minimizado: burbuja con el contador
  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm pl-3 pr-4 py-2.5 rounded-full shadow-lg shadow-amber-200 transition-colors print:hidden"
      >
        <ClipboardList size={16} />
        {visibles.length} tarea{visibles.length !== 1 ? 's' : ''}
        <ChevronUp size={14} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-xl print:hidden">
      <div className="bg-white rounded-2xl border border-amber-200 shadow-xl shadow-amber-100/60 overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2.5 border-b border-amber-100">
          <div className="flex items-center gap-2 text-amber-800">
            <ClipboardList size={16} />
            <span className="text-sm font-bold">
              Tienes {visibles.length} tarea{visibles.length !== 1 ? 's' : ''} pendiente{visibles.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/tareas"
              className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors"
            >
              Ver todas <ArrowUpRight size={12} />
            </Link>
            <button
              onClick={() => setAbierto(false)}
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100 transition-colors"
              title="Minimizar"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {/* Lista de tareas (máx. 3 visibles, el resto con scroll) */}
        <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
          {visibles.map(t => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{t.titulo}</p>
                {t.descripcion && <p className="text-xs text-gray-400 truncate">{t.descripcion}</p>}
              </div>
              <button
                onClick={() => completar(t.id)}
                disabled={pendingId === t.id}
                className="shrink-0 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Check size={13} />
                {pendingId === t.id ? '...' : 'Lista'}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</p>}
      </div>
    </div>
  )
}
