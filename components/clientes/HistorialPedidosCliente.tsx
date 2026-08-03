'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import type { EstadoPedido } from '@/types'

type PedidoHist = {
  id: string
  numero_orden: string
  estado: string
  sede_nombre: string
  total: number
  fecha_creacion: string
  factura_id: string | null
}

type Filtro = 'todos' | 'entregados' | 'sin_entregar'

// Historial de pedidos de la ficha del cliente, con filtro por entrega y la
// suma de lo visible al pie. "Entregados" excluye deudas cargadas (SALDO-):
// son saldos viejos, no mercancía entregada.
export function HistorialPedidosCliente({ pedidos }: { pedidos: PedidoHist[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const visibles = useMemo(() => pedidos.filter(p => {
    const esSaldo = p.numero_orden.startsWith('SALDO-')
    if (filtro === 'entregados')   return !esSaldo && p.estado === 'entregado'
    if (filtro === 'sin_entregar') return !esSaldo && p.estado !== 'entregado' && p.estado !== 'cancelado'
    return true
  }), [pedidos, filtro])

  const suma = visibles
    .filter(p => p.estado !== 'cancelado')
    .reduce((s, p) => s + (p.total ?? 0), 0)

  const chips: Array<{ key: Filtro; label: string }> = [
    { key: 'todos',        label: 'Todos' },
    { key: 'entregados',   label: '✅ Entregados' },
    { key: 'sin_entregar', label: '⏳ Sin entregar' },
  ]

  return (
    <>
      <div className="flex gap-1.5 px-6 pb-3 flex-wrap">
        {chips.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFiltro(c.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filtro === c.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="px-6 py-4 text-sm text-gray-400 border-t border-gray-100">
          {filtro === 'entregados' ? 'Nada entregado todavía.' : filtro === 'sin_entregar' ? 'Nada pendiente por entregar.' : 'Sin pedidos registrados.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Orden</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sede</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map(p => {
                // Las deudas cargadas (SALDO-) no son pedidos de venta.
                const esSaldo = p.numero_orden.startsWith('SALDO-')
                // Las ventas locales (VL-) abren su factura; el resto, el pedido.
                const href = p.numero_orden.startsWith('VL-') && p.factura_id
                  ? `/facturacion/${p.factura_id}`
                  : `/pedidos/${p.id}`
                return (
                  <tr key={p.id} className={esSaldo ? 'bg-amber-50/40 hover:bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="px-6 py-3">
                      {esSaldo ? (
                        <span className="text-amber-800 font-medium">Saldo anterior</span>
                      ) : (
                        <Link href={href} className="font-mono font-medium text-blue-600 hover:underline">
                          {p.numero_orden}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {esSaldo ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800">Deuda</span>
                      ) : (
                        <EstadoBadge estado={p.estado as EstadoPedido} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.sede_nombre}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCOP(p.total)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatFecha(p.fecha_creacion)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={href}
                        className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-6 py-3 text-xs font-semibold text-gray-600 uppercase" colSpan={3}>
                  Suma ({visibles.length} pedido{visibles.length !== 1 ? 's' : ''}
                  {filtro === 'entregados' ? ' entregados' : filtro === 'sin_entregar' ? ' sin entregar' : ''})
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCOP(suma)}</td>
                <td colSpan={2} className="px-4 py-3 text-[11px] text-gray-400">
                  {filtro === 'todos' && visibles.some(p => p.estado === 'cancelado') ? 'sin contar cancelados' : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}
