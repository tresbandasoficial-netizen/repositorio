'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pedidosPorEntregarAction, type PedidoPorEntregar } from '@/app/actions/pedidos'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { X } from 'lucide-react'

// Recuadro "Por entregar" del ranking de asesores: al tocarlo se abre una
// ventana con la lista de esos pedidos (los que no están entregados ni
// cancelados), cada uno clicable hacia su detalle.
export function PorEntregarBox({ asesorId, asesorNombre, count }: { asesorId: string; asesorNombre: string; count: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pedidos, setPedidos] = useState<PedidoPorEntregar[] | null>(null)
  const [error, setError] = useState('')

  async function abrir() {
    if (count === 0) return
    setOpen(true)
    setError('')
    if (pedidos === null) {
      try {
        setPedidos(await pedidosPorEntregarAction(asesorId))
      } catch {
        setError('No se pudo cargar la lista. Recarga la página (F5) e intenta de nuevo.')
      }
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        disabled={count === 0}
        className={`rounded-lg px-2 py-1.5 text-center border w-full transition-colors ${
          count > 0
            ? 'bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100 cursor-pointer'
            : 'bg-gray-50 border-gray-100 cursor-default'
        }`}
        title={count > 0 ? 'Ver los pedidos que faltan por entregar' : undefined}
      >
        <p className={`text-[10px] uppercase font-semibold ${count > 0 ? 'text-amber-700' : 'text-gray-400'}`}>📦 Por entregar</p>
        <p className={`text-base font-bold ${count > 0 ? 'text-amber-700' : 'text-gray-800'}`}>
          {count}{count > 0 && <span className="text-[10px] font-semibold ml-1">▾</span>}
        </p>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">📦 Por entregar — {asesorNombre}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{count} pedido{count !== 1 ? 's' : ''} sin entregar</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-1.5">
              {error && <p className="text-sm text-red-600 px-2 py-2">{error}</p>}
              {!error && pedidos === null && <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>}
              {pedidos?.map((p, i) => {
                const saldo = p.total - p.total_pagado
                return (
                  <button
                    key={p.id}
                    onClick={() => router.push(`/pedidos/${p.id}`)}
                    className="w-full text-left border border-gray-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5 flex-wrap hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <span className="w-5 h-5 rounded-md bg-gray-200 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="font-mono font-bold text-sm text-gray-900 shrink-0">{p.numero_orden}</span>
                    <EstadoBadge estado={p.estado} enAlerta={false} />
                    <span className="text-xs text-gray-500 truncate flex-1 min-w-20">{p.cliente_nombre}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatFecha(p.fecha_creacion)}</span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-bold text-gray-900">{formatCOP(p.total)}</span>
                      {saldo > 0 && <span className="block text-[11px] text-red-500 font-medium">debe {formatCOP(saldo)}</span>}
                    </span>
                  </button>
                )
              })}
              {pedidos?.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No tiene pedidos pendientes de entrega</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
