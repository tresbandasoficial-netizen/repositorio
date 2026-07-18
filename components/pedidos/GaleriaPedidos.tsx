'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoBadge } from './EstadoBadge'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ImageOff, X, ArrowUpRight } from 'lucide-react'

// Galería: cuadrícula de pedidos (filas de 6) y, al lado, un visor con la
// foto del pedido seleccionado EN GRANDE + sus datos.
export function GaleriaPedidos({ pedidos }: { pedidos: PedidoRow[] }) {
  const router = useRouter()
  const [sel, setSel] = useState<PedidoRow | null>(pedidos[0] ?? null)
  const [verMovil, setVerMovil] = useState(false)

  function elegir(p: PedidoRow) {
    setSel(p)
    setVerMovil(true) // en pantallas pequeñas abre el visor encima
  }

  const imagenSel = sel ? ((sel as any).primera_imagen as string | null) : null
  const saldoSel = sel ? sel.total - sel.total_pagado : 0

  const Visor = sel && (
    <div className="space-y-3">
      {/* LA FOTO EN GRANDE */}
      {imagenSel ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagenSel}
          alt={sel.numero_orden}
          className="w-full aspect-square object-cover rounded-2xl border border-gray-200 shadow-sm"
        />
      ) : (
        <div className="w-full aspect-square bg-gray-50 rounded-2xl border border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-300">
          <ImageOff size={40} />
          <span className="text-sm">Este pedido no tiene foto</span>
        </div>
      )}

      {/* Datos del pedido */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono font-bold text-lg text-gray-900">{sel.numero_orden}</span>
          <EstadoBadge estado={sel.estado} enAlerta={false} />
        </div>
        <p className="text-sm font-semibold text-gray-800">{sel.cliente_nombre}</p>
        <p className="text-xs text-gray-400">{formatearTelefono(sel.cliente_telefono)} · {formatFecha(sel.fecha_creacion)} · {sel.sede_codigo}</p>
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-900">{formatCOP(sel.total)}</span>
          {saldoSel > 0
            ? <span className="text-xs text-red-500 font-semibold">Saldo: {formatCOP(saldoSel)}</span>
            : <span className="text-xs text-emerald-600 font-semibold">Pagado ✓</span>}
        </div>
        <button
          onClick={() => router.push(`/pedidos/${sel.id}`)}
          className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
        >
          Abrir pedido <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex gap-5 items-start">
      {/* Cuadrícula: filas de 6 */}
      <div className="flex-1 min-w-0 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {pedidos.map((p) => {
          const imagen = (p as any).primera_imagen as string | null
          const activa = sel?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => elegir(p)}
              className={`group text-left bg-white rounded-xl border overflow-hidden transition-all ${
                activa ? 'border-blue-500 ring-2 ring-blue-300 shadow-md' : 'border-gray-100 shadow-sm hover:border-blue-200 hover:shadow'
              }`}
            >
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt={p.numero_orden} loading="lazy" className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square bg-gray-50 flex items-center justify-center text-gray-300">
                  <ImageOff size={20} />
                </div>
              )}
              <div className="px-2 py-1.5">
                <p className="font-mono font-bold text-[11px] text-gray-900 truncate">{p.numero_orden}</p>
                <p className="text-[10px] text-gray-400 truncate">{p.cliente_nombre}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Visor lateral (pantallas grandes): la foto EN GRANDE a un lado */}
      <aside className="hidden lg:block w-[360px] xl:w-[420px] shrink-0 sticky top-20">
        {Visor ?? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            Toca un pedido para ver su foto en grande
          </div>
        )}
      </aside>

      {/* Visor móvil: overlay a pantalla completa */}
      {verMovil && sel && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setVerMovil(false)}>
          <div className="bg-gray-50 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-3 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setVerMovil(false)}
              className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
            >
              <X size={16} />
            </button>
            {Visor}
          </div>
        </div>
      )}
    </div>
  )
}
