'use client'

import { Trophy } from 'lucide-react'
import { formatCOP } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { AvanceReto, CategoriaReto, MetricaReto } from '@/lib/queries/retos'

// Cómo se nombra lo que mide el reto: 10 → "10 pares", $500.000 → "$ 500.000"
export function formatoValor(metrica: MetricaReto, categoria: CategoriaReto | null, valor: number): string {
  if (metrica === 'ventas') return formatCOP(valor)
  const n = Math.round(valor)
  if (metrica === 'pedidos') return `${n} pedido${n === 1 ? '' : 's'}`
  if (categoria === 'tenis') return `${n} par${n === 1 ? '' : 'es'}`
  if (categoria === 'ropa') return `${n} prenda${n === 1 ? '' : 's'}`
  return `${n} unidad${n === 1 ? '' : 'es'}`
}

export function etiquetaMeta(metrica: MetricaReto, categoria: CategoriaReto | null, objetivo: number): string {
  const base = formatoValor(metrica, categoria, objetivo)
  if (metrica === 'unidades' && categoria === 'tenis') return `${base} de zapatos`
  if (metrica === 'unidades' && categoria === 'accesorios') return `${base} de accesorios`
  return base
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit',
  })
}

const MEDALLAS = ['🥇', '🥈', '🥉']

// Tabla de posiciones. Los que ya completaron van arriba, ordenados por la
// hora en que lo lograron (el primero gana); el resto por lo que llevan.
export function RankingReto({
  avances,
  objetivo,
  metrica,
  categoria,
  usuarioId,
  compacto = false,
}: {
  avances: AvanceReto[]
  objetivo: number
  metrica: MetricaReto
  categoria: CategoriaReto | null
  usuarioId?: string
  compacto?: boolean
}) {
  if (avances.length === 0) {
    return <p className="text-xs text-gray-400 px-1 py-2">Nadie compite en este reto todavía.</p>
  }

  return (
    <ul className={cn('space-y-1.5', compacto && 'space-y-1')}>
      {avances.map((a, i) => {
        const pct = Math.min(100, Math.round((a.valor / objetivo) * 100))
        const listo = a.completado_en !== null
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
                {listo && i < 3 ? MEDALLAS[i] : <span className="text-gray-400 font-bold">{i + 1}</span>}
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
