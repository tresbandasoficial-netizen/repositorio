'use client'

import { useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PedidosResult } from '@/lib/queries/pedidos'
import { PedidoCard } from './PedidoCard'
import { EstadoPedido, ESTADO_LABELS } from '@/types'
import { Search, AlertTriangle, Download, ChevronLeft, ChevronRight } from 'lucide-react'

const ESTADOS: Array<{ value: EstadoPedido | ''; label: string }> = [
  { value: '',            label: 'Todos los estados' },
  { value: 'pendiente',   label: ESTADO_LABELS.pendiente },
  { value: 'comprado',    label: ESTADO_LABELS.comprado },
  { value: 'usa',         label: ESTADO_LABELS.usa },
  { value: 'bucaramanga', label: ESTADO_LABELS.bucaramanga },
  { value: 'santa_rosa',  label: ESTADO_LABELS.santa_rosa },
  { value: 'entregado',   label: ESTADO_LABELS.entregado },
  { value: 'cancelado',   label: ESTADO_LABELS.cancelado },
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

  const estadoActual  = searchParams.get('estado') ?? ''
  const sedeActual    = searchParams.get('sede')   ?? ''
  const busqueda      = searchParams.get('q')      ?? ''
  const soloAlertas   = searchParams.get('alerta') === '1'
  const fechaDesde    = searchParams.get('desde')  ?? ''
  const fechaHasta    = searchParams.get('hasta')  ?? ''

  function setFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
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

  function buildExportUrl() {
    const params = new URLSearchParams()
    if (busqueda)     params.set('q', busqueda)
    if (estadoActual) params.set('estado', estadoActual)
    if (sedeActual)   params.set('sede', sedeActual)
    if (soloAlertas)  params.set('alerta', '1')
    if (fechaDesde)   params.set('desde', fechaDesde)
    if (fechaHasta)   params.set('hasta', fechaHasta)
    const qs = params.toString()
    return `/api/export/pedidos${qs ? `?${qs}` : ''}`
  }

  const { pedidos, total, pagina, totalPaginas } = resultado
  const desde = (pagina - 1) * 25 + 1
  const hasta  = Math.min(pagina * 25, total)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Fila 1: búsqueda + alertas + csv */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder-gray-400"
            />
          </div>
          <button
            onClick={toggleAlertas}
            title="Solo pedidos en alerta"
            className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
              soloAlertas
                ? 'bg-red-600 border-red-600 text-white shadow-sm shadow-red-200'
                : 'bg-white border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-600'
            }`}
          >
            <AlertTriangle size={14} />
            <span className="hidden sm:inline">Alertas</span>
          </button>
          <a
            href={buildExportUrl()}
            download
            title="Exportar CSV"
            className="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            <span className="hidden sm:inline">CSV</span>
          </a>
        </div>

        {/* Fila 2: filtros + fechas */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={estadoActual}
            onChange={(e) => setFiltro('estado', e.target.value)}
            className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>

          {esAdmin && (
            <select
              value={sedeActual}
              onChange={(e) => setFiltro('sede', e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
            >
              {SEDES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          <input
            key={fechaDesde}
            type="date"
            defaultValue={fechaDesde}
            onChange={(e) => setFiltro('desde', e.target.value)}
            title="Desde"
            className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
          />
          <input
            key={fechaHasta + '-h'}
            type="date"
            defaultValue={fechaHasta}
            onChange={(e) => setFiltro('hasta', e.target.value)}
            title="Hasta"
            className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
          />

          {(fechaDesde || fechaHasta) && (
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.delete('desde')
                params.delete('hasta')
                params.delete('pagina')
                router.push(`${pathname}?${params.toString()}`)
              }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg"
            >
              ✕
            </button>
          )}

          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap font-medium">
            {total === 0 ? 'Sin resultados' : `${desde}–${hasta} de ${total}`}
          </span>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="hidden md:flex px-6 py-3.5 bg-gray-50/60 border-b border-gray-100 gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <span className="w-24">Orden</span>
          <span className="flex-1">Cliente</span>
          <span className="w-40">Estado</span>
          <span className="w-32 text-right">Valor</span>
          {esAdmin && <span className="w-32 text-right">Asesor</span>}
          <span className="w-24 text-right hidden lg:block">Fecha</span>
          <span className="w-4" />
        </div>

        {pedidos.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Search size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No hay pedidos con estos filtros</p>
            <p className="text-gray-400 text-xs mt-1">Intenta con otros criterios de búsqueda</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pedidos.map((pedido) => (
              <PedidoCard key={pedido.id} pedido={pedido} esAdmin={esAdmin} />
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => irAPagina(pagina - 1)}
            disabled={pagina === 1}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <ChevronLeft size={15} />
            Anterior
          </button>
          <span className="text-sm text-gray-400 font-medium">
            {pagina} / {totalPaginas}
          </span>
          <button
            onClick={() => irAPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Siguiente
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
