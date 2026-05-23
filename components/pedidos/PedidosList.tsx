'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PedidoRow } from '@/lib/queries/pedidos'
import { PedidoCard } from './PedidoCard'
import { EstadoPedido, ESTADO_LABELS } from '@/types'

const ESTADOS: Array<{ value: EstadoPedido | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: ESTADO_LABELS.pendiente },
  { value: 'comprado', label: ESTADO_LABELS.comprado },
  { value: 'llego_usa', label: ESTADO_LABELS.llego_usa },
  { value: 'bodega_colombia', label: ESTADO_LABELS.bodega_colombia },
  { value: 'en_sede', label: ESTADO_LABELS.en_sede },
  { value: 'entregado', label: ESTADO_LABELS.entregado },
  { value: 'cancelado', label: ESTADO_LABELS.cancelado },
]

const SEDES = [
  { value: '', label: 'Todas las sedes' },
  { value: 'TR', label: 'Bucaramanga (TR)' },
  { value: 'CR', label: 'Cúcuta (CR)' },
  { value: 'SR', label: 'Santa Rosa (SR)' },
]

interface PedidosListProps {
  pedidos: PedidoRow[]
  esAdmin: boolean
}

export function PedidosList({ pedidos, esAdmin }: PedidosListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const estadoActual = searchParams.get('estado') ?? ''
  const sedeActual = searchParams.get('sede') ?? ''
  const busqueda = searchParams.get('q') ?? ''

  function setFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }

  const pedidosFiltrados = pedidos.filter((p) => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return (
      p.numero_orden.toLowerCase().includes(q) ||
      p.cliente_nombre.toLowerCase().includes(q) ||
      p.cliente_telefono.includes(q)
    )
  })

  // en_alerta viene de SQL — no hay lógica de umbrales aquí
  const totalEnAlerta = pedidosFiltrados.filter((p) => p.en_alerta).length

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Buscar por número, cliente o teléfono..."
          defaultValue={busqueda}
          onChange={(e) => setFiltro('q', e.target.value)}
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

        {totalEnAlerta > 0 && (
          <span className="text-sm text-red-600 font-medium">
            ⚠ {totalEnAlerta} en alerta
          </span>
        )}

        <span className="text-sm text-gray-400 ml-auto">
          {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        <div
          className="px-6 py-3 bg-gray-50 rounded-t-xl flex gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          <span className="w-24">Orden</span>
          <span className="flex-1">Cliente</span>
          <span className="w-40">Estado</span>
          <span className="w-32 text-right">Valor</span>
          {esAdmin && <span className="w-32 text-right hidden md:block">Asesor</span>}
          <span className="w-24 text-right hidden lg:block">Fecha</span>
          <span className="w-4" />
        </div>

        {pedidosFiltrados.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No hay pedidos con estos filtros.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pedidosFiltrados.map((pedido) => (
              <PedidoCard key={pedido.id} pedido={pedido} esAdmin={esAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
