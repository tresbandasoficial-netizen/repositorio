'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PedidosResult } from '@/lib/queries/pedidos'
import { PedidoCard } from './PedidoCard'
import { EstadoPedido, ESTADO_LABELS } from '@/types'

const ESTADOS: Array<{ value: EstadoPedido | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente',        label: ESTADO_LABELS.pendiente },
  { value: 'comprado',         label: ESTADO_LABELS.comprado },
  { value: 'llego_usa',        label: ESTADO_LABELS.llego_usa },
  { value: 'bodega_colombia',  label: ESTADO_LABELS.bodega_colombia },
  { value: 'avisado',          label: ESTADO_LABELS.avisado },
  { value: 'en_sede',          label: ESTADO_LABELS.en_sede },
  { value: 'entregado',        label: ESTADO_LABELS.entregado },
  { value: 'cancelado',        label: ESTADO_LABELS.cancelado },
]

const SEDES = [
  { value: '', label: 'Todas las sedes' },
  { value: 'TR', label: 'Bucaramanga (TR)' },
  { value: 'CR', label: 'Cúcuta (CR)' },
  { value: 'SR', label: 'Santa Rosa (SR)' },
]

interface PedidosListProps {
  resultado: PedidosResult
  esAdmin: boolean
}

export function PedidosList({ resultado, esAdmin }: PedidosListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const estadoActual = searchParams.get('estado') ?? ''
  const sedeActual   = searchParams.get('sede')   ?? ''
  const busqueda     = searchParams.get('q')      ?? ''
  const soloAlertas  = searchParams.get('alerta') === '1'

  function setFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // Resetear paginación al cambiar filtros
    params.delete('pagina')
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleAlertas() {
    const params = new URLSearchParams(searchParams.toString())
    if (soloAlertas) params.delete('alerta')
    else params.set('alerta', '1')
    params.delete('pagina')
    router.push(`${pathname}?${params.toString()}`)
  }

  function irAPagina(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (p === 1) params.delete('pagina')
    else params.set('pagina', p.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  const { pedidos, total, pagina, totalPaginas } = resultado
  const desde = (pagina - 1) * 25 + 1
  const hasta  = Math.min(pagina * 25, total)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          key={busqueda}
          type="search"
          placeholder="Buscar por número, cliente o teléfono..."
          defaultValue={busqueda}
          onChange={(e) => {
            const val = e.target.value
            clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => setFiltro('q', val), 400)
          }}
          className="flex-1 min-w-48 max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={estadoActual}
          onChange={(e) => setFiltro('estado', e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>

        {esAdmin && (
          <select
            value={sedeActual}
            onChange={(e) => setFiltro('sede', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SEDES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}

        <button
          onClick={toggleAlertas}
          className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
            soloAlertas
              ? 'bg-red-600 border-red-600 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600'
          }`}
        >
          ⚠ Alertas
        </button>

        <span className="text-sm text-gray-400 ml-auto">
          {total === 0 ? 'Sin resultados' : `${desde}–${hasta} de ${total}`}
        </span>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        <div className="px-6 py-3 bg-gray-50 rounded-t-xl flex gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span className="w-24">Orden</span>
          <span className="flex-1">Cliente</span>
          <span className="w-40">Estado</span>
          <span className="w-32 text-right">Valor</span>
          {esAdmin && <span className="w-32 text-right hidden md:block">Asesor</span>}
          <span className="w-24 text-right hidden lg:block">Fecha</span>
          <span className="w-4" />
        </div>

        {pedidos.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No hay pedidos con estos filtros.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pedidos.map((pedido) => (
              <PedidoCard key={pedido.id} pedido={pedido} esAdmin={esAdmin} />
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => irAPagina(pagina - 1)}
            disabled={pagina === 1}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            onClick={() => irAPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
