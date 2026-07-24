'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trophy, ChevronDown, ChevronUp, ArrowUpRight, Gift } from 'lucide-react'
import type { AvanceGrupo, AvanceReto, Reto } from '@/lib/queries/retos'
import { BarraGrupo, RankingReto, etiquetaMeta } from './RetoUI'

// Cada cuánto se vuelve a leer el avance desde el servidor.
const REFRESCO_MS = 30_000

// Aviso flotante del reto vigente, visible en todas las páginas (igual que el
// de tareas, pero abajo a la izquierda para no taparlo). Muestra la meta, el
// premio con su foto y la tabla de posiciones, y se actualiza solo.
export function AvisoReto({
  reto,
  avances,
  grupo,
  usuarioId,
}: {
  reto: Reto
  avances: AvanceReto[]
  grupo: AvanceGrupo | null
  usuarioId: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(true)

  // "En tiempo real": el avance se relee cada 30 segundos, y también al volver
  // a la pestaña (si estuvo en segundo plano, muestra el dato fresco de una).
  useEffect(() => {
    const cada = setInterval(() => router.refresh(), REFRESCO_MS)
    function alVolver() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(cada)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [router])

  const grupal = reto.modo === 'grupal'
  const yo = avances.find(a => a.usuario_id === usuarioId)
  const ganador = grupal ? undefined : avances.find(a => a.completado_en !== null)
  // En la burbuja minimizada: el % del grupo si es grupal, el mío si es individual
  const pctBurbuja = grupal
    ? (grupo ? Math.min(100, Math.round((grupo.valor / reto.objetivo) * 100)) : null)
    : (yo ? Math.min(100, Math.round((yo.valor / reto.objetivo) * 100)) : null)

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm pl-3 pr-4 py-2.5 rounded-full shadow-lg shadow-violet-200 transition-colors print:hidden"
      >
        <Trophy size={16} />
        Reto
        {pctBurbuja !== null && <span className="text-violet-200">· {pctBurbuja}%</span>}
        <ChevronUp size={14} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] sm:w-[22rem] print:hidden">
      <div className="bg-white rounded-2xl border border-violet-200 shadow-xl shadow-violet-100/60 overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2 bg-violet-50 px-3.5 py-2.5 border-b border-violet-100">
          <div className="flex items-center gap-2 text-violet-800 min-w-0">
            <Trophy size={16} className="shrink-0" />
            <span className="text-sm font-bold truncate">{reto.titulo}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/retos"
              className="flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900 px-2 py-1 rounded-lg hover:bg-violet-100 transition-colors"
            >
              Ver <ArrowUpRight size={12} />
            </Link>
            <button
              onClick={() => setAbierto(false)}
              className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors"
              title="Minimizar"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        <div className="px-3.5 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* La meta y el premio */}
          <div className="flex items-start gap-3">
            {reto.imagen_url && (
              <a href={reto.imagen_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img
                  src={reto.imagen_url}
                  alt="Premio"
                  loading="lazy"
                  className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                />
              </a>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900">
                Meta {grupal ? 'entre todos' : 'de cada uno'}:{' '}
                {etiquetaMeta(reto.metrica, reto.categoria, reto.objetivo)}
              </p>
              {reto.descripcion && (
                <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{reto.descripcion}</p>
              )}
              {reto.premio && (
                <p className="text-xs font-semibold text-amber-700 mt-1 flex items-start gap-1">
                  <Gift size={12} className="shrink-0 mt-0.5" />
                  <span>{reto.premio}</span>
                </p>
              )}
            </div>
          </div>

          {grupal && grupo && (
            <BarraGrupo
              grupo={grupo}
              objetivo={reto.objetivo}
              metrica={reto.metrica}
              categoria={reto.categoria}
            />
          )}

          {ganador && (
            <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
              🏆 {ganador.nombre} fue el primero en completarlo
            </p>
          )}

          {grupal && <p className="text-[11px] font-semibold text-gray-500">Lo que puso cada uno</p>}

          <RankingReto
            avances={avances}
            objetivo={reto.objetivo}
            metrica={reto.metrica}
            categoria={reto.categoria}
            usuarioId={usuarioId}
            modo={reto.modo}
            compacto
          />

          <p className="text-[10px] text-gray-400 text-center">Se actualiza solo cada 30 segundos</p>
        </div>
      </div>
    </div>
  )
}
