'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { confirmarAsignacionAction, rechazarAsignacionAction } from '@/app/actions/asignaciones'
import { formatCOP } from '@/lib/utils/format'

// Panel de sugerencias compra→pedido pendientes de confirmar. Aparece arriba
// en /compras cuando el sistema detectó que un artículo de un pedido nuevo ya
// estaba comprado "de más": el admin decide si esa unidad es la del pedido.

export type AsignacionPendienteUI = {
  id: string
  pedidoId: string
  pedidoNumero: string
  pedidoEstado: string
  cliente: string | null
  articulo: string        // "ALO FALDA · T S"
  codigo: string | null
  costo: number
  compraId: string
  factura: string         // "42904118 (alo)"
  llego: boolean
  creadoEn: string
}

export function AsignacionesPendientes({ filas }: { filas: AsignacionPendienteUI[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (filas.length === 0) return null

  const resolver = (id: string, accion: 'confirmar' | 'rechazar') => {
    setProcesando(id)
    setError(null)
    startTransition(async () => {
      const res = accion === 'confirmar'
        ? await confirmarAsignacionAction(id)
        : await rechazarAsignacionAction(id)
      if (!res.ok) setError(res.error)
      setProcesando(null)
      router.refresh()
    })
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200">
        <p className="text-sm font-semibold text-amber-900">
          🕐 Compras por asignar a pedidos ({filas.length})
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Estos artículos de pedidos nuevos coinciden con compras &quot;sin asignar&quot; que ya estaban hechas.
          Nada se asigna solo: confirma si esa unidad comprada es la del pedido, o descarta para comprarla aparte.
        </p>
      </div>
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">{error}</div>
      )}
      <div className="divide-y divide-amber-100">
        {filas.map(f => {
          const ocupado = procesando === f.id
          return (
            <div key={f.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 bg-white/60">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {f.articulo}
                  {f.codigo && <span className="ml-2 font-mono text-xs text-gray-400">{f.codigo}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pedido{' '}
                  <Link href={`/pedidos/${f.pedidoId}`} className="font-mono font-semibold text-blue-700 hover:underline">
                    {f.pedidoNumero}
                  </Link>
                  {f.cliente && <> · {f.cliente}</>}
                  <span className="ml-1.5 inline-block rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium">{f.pedidoEstado}</span>
                  {' '}→ factura <Link href={`/compras/${f.compraId}`} className="font-mono text-blue-700 hover:underline">{f.factura}</Link>
                  {' '}· costo {formatCOP(f.costo)}
                  {f.llego
                    ? <span className="ml-1.5 inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[11px] font-medium">ya llegó</span>
                    : <span className="ml-1.5 inline-block rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-medium">en camino</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => resolver(f.id, 'confirmar')}
                  disabled={ocupado}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {ocupado ? '…' : '✓ Asignar al pedido'}
                </button>
                <button
                  onClick={() => resolver(f.id, 'rechazar')}
                  disabled={ocupado}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Descartar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
