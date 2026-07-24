'use client'

import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatoValor } from './formato'
import type { AvanceGrupo, AvanceReto, CategoriaReto, MetricaReto, ModoReto } from '@/lib/queries/retos'

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit',
  })
}

const MEDALLAS = ['🥇', '🥈', '🥉']

// Barra grande del reto grupal: lo que lleva el equipo contra la meta única.
export function BarraGrupo({
  grupo,
  objetivo,
  metrica,
  categoria,
}: {
  grupo: AvanceGrupo
  objetivo: number
  metrica: MetricaReto
  categoria: CategoriaReto | null
}) {
  const pct = Math.min(100, Math.round((grupo.valor / objetivo) * 100))
  const listo = grupo.completado_en !== null
  const falta = Math.max(0, objetivo - grupo.valor)

  return (
    <div className={cn('rounded-xl px-3 py-2.5 border', listo ? 'bg-emerald-50 border-emerald-200' : 'bg-violet-50 border-violet-200')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-xs font-bold', listo ? 'text-emerald-800' : 'text-violet-800')}>
          {listo ? '¡Meta lograda entre todos!' : 'Van entre todos'}
        </span>
        <span className={cn('text-sm font-bold', listo ? 'text-emerald-800' : 'text-violet-900')}>
          {formatoValor(metrica, categoria, grupo.valor)}
          <span className="text-xs font-medium text-gray-400"> / {formatoValor(metrica, categoria, objetivo)}</span>
        </span>
      </div>
      <div className="h-2.5 bg-white/70 rounded-full overflow-hidden mt-2">
        <div
          className={cn('h-full rounded-full transition-all', listo ? 'bg-emerald-500' : 'bg-violet-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-[11px] mt-1.5 font-semibold flex items-center gap-1', listo ? 'text-emerald-700' : 'text-violet-700')}>
        {listo ? (
          <><Trophy size={11} /> Lograda a las {horaCorta(grupo.completado_en!)}</>
        ) : (
          <>{pct}% · faltan {formatoValor(metrica, categoria, falta)}</>
        )}
      </p>
    </div>
  )
}

// Tabla de posiciones. Los que ya completaron van arriba, ordenados por la
// hora en que lo lograron (el primero gana); el resto por lo que llevan.
export function RankingReto({
  avances,
  objetivo,
  metrica,
  categoria,
  usuarioId,
  compacto = false,
  modo = 'individual',
}: {
  avances: AvanceReto[]
  objetivo: number
  metrica: MetricaReto
  categoria: CategoriaReto | null
  usuarioId?: string
  compacto?: boolean
  modo?: ModoReto
}) {
  // En un reto grupal no hay ganador individual: se muestra cuánto aportó cada
  // uno a la meta común, sin medallas ni hora de "completado".
  const grupal = modo === 'grupal'
  if (avances.length === 0) {
    return <p className="text-xs text-gray-400 px-1 py-2">Nadie compite en este reto todavía.</p>
  }

  // En grupal manda el aporte; en individual, quién completó primero (ya viene
  // ordenado así desde la consulta).
  const filas = grupal ? [...avances].sort((a, b) => b.valor - a.valor) : avances

  return (
    <ul className={cn('space-y-1.5', compacto && 'space-y-1')}>
      {filas.map((a, i) => {
        const pct = Math.min(100, Math.round((a.valor / objetivo) * 100))
        const listo = !grupal && a.completado_en !== null
        const soyYo = usuarioId !== undefined && a.usuario_id === usuarioId
        return (
          <li
            key={a.usuario_id}
            className={cn(
              'rounded-xl px-2.5 py-2',
              soyYo ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-center text-xs shrink-0">
                {listo && i < 3
                  ? MEDALLAS[i]
                  : <span className="text-gray-400 font-bold">{i + 1}</span>}
              </span>
              <span className={cn('text-sm font-semibold truncate flex-1 min-w-0', soyYo ? 'text-blue-900' : 'text-gray-800')}>
                {a.nombre}
                {soyYo && <span className="text-[10px] font-bold text-blue-500 ml-1.5">tú</span>}
                <span className="text-[10px] text-gray-400 font-medium ml-1.5">{a.sede}</span>
              </span>
              <span className={cn('text-xs font-bold shrink-0', listo ? 'text-emerald-700' : 'text-gray-600')}>
                {formatoValor(metrica, categoria, a.valor)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', listo ? 'bg-emerald-500' : 'bg-blue-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {listo ? (
                <span className="text-[10px] font-bold text-emerald-700 shrink-0 flex items-center gap-1">
                  <Trophy size={10} /> {horaCorta(a.completado_en!)}
                </span>
              ) : (
                <span className="text-[10px] text-gray-400 shrink-0">{pct}%</span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
