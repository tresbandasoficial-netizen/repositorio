'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { METODO_PAGO_LABELS, MetodoPago } from '@/types'
import { editarAbonoAction, eliminarAbonoAction } from '@/app/actions/abonos'
import type { AbonoCliente } from '@/lib/queries/clientes'

const metodoLabel = (m: string) => METODO_PAGO_LABELS[m as MetodoPago] ?? m

// Historial de abonos del cliente. Cada abono puede estar repartido entre varios
// pedidos/facturas; se muestra el total y, al expandir, cada parte. El admin
// puede editar el monto de cada parte y eliminar (anular) el abono completo.
export function HistorialPagos({ abonos, esAdmin }: { abonos: AbonoCliente[]; esAdmin: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  if (abonos.length === 0) {
    return <p className="px-6 py-4 text-sm text-gray-400">Sin pagos registrados.</p>
  }

  const totalPagado = abonos
    .filter(a => a.metodo !== 'credito')
    .reduce((s, a) => s + a.total, 0)

  function abrirEdicion(a: AbonoCliente) {
    const init: Record<string, string> = {}
    a.partes.forEach(p => { init[p.id] = String(p.monto) })
    setMontos(init)
    setEditando(a.creado_en + '|' + a.metodo)
    setAbierto(a.creado_en + '|' + a.metodo)
    setError('')
  }

  function guardar(a: AbonoCliente) {
    setError('')
    start(async () => {
      for (const p of a.partes) {
        const nuevo = parseInt(montos[p.id] ?? '', 10)
        if (!Number.isFinite(nuevo) || nuevo <= 0) { setError('Los montos deben ser mayores a cero'); return }
        if (nuevo !== p.monto) {
          const r = await editarAbonoAction(p.id, p.origen, nuevo)
          if (!r.ok) { setError(r.error); return }
        }
      }
      setEditando(null)
      router.refresh()
    })
  }

  function eliminar(a: AbonoCliente) {
    const parts = a.partes.length
    if (!confirm(`¿Eliminar este abono de ${formatCOP(a.total)}${parts > 1 ? ` (repartido en ${parts} pedidos)` : ''}? Se puede revertir desde soporte.`)) return
    setError('')
    start(async () => {
      const r = await eliminarAbonoAction(a.partes.map(p => ({ id: p.id, origen: p.origen })))
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}

      {/* Lista compacta: cada abono es una tarjeta que cabe sin deslizar */}
      <div className="divide-y divide-gray-50">
        {abonos.map(a => {
          const key = a.creado_en + '|' + a.metodo
          const esCredito = a.metodo === 'credito'
          const expandido = abierto === key
          const enEdicion = editando === key
          const multi = a.partes.length > 1
          const totalEdit = enEdicion
            ? a.partes.reduce((s, p) => s + (parseInt(montos[p.id] ?? '0', 10) || 0), 0)
            : a.total
          return (
            <div key={key} className="px-4 py-3 hover:bg-gray-50/60">
              {/* Fila 1: fecha + monto */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{formatFecha(a.fecha)}</span>
                <span className={`text-sm font-bold ${esCredito ? 'text-gray-400' : 'text-green-700'}`}>
                  {esCredito ? `(${formatCOP(totalEdit)})` : formatCOP(totalEdit)}
                </span>
              </div>

              {/* Fila 2: método + referencia */}
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs text-gray-600">
                  {metodoLabel(a.metodo)}
                  {esCredito && <span className="ml-1 text-gray-400">(deuda)</span>}
                </span>
                {multi ? (
                  <button onClick={() => setAbierto(expandido ? null : key)} className="text-xs text-blue-600 hover:underline">
                    {expandido ? '▾' : '▸'} {a.partes.length} pedidos
                  </button>
                ) : (
                  <Link
                    href={a.partes[0].origen === 'pedido' ? `/pedidos/${a.partes[0].referencia_id}` : `/facturacion/${a.partes[0].referencia_id}`}
                    className="font-mono text-xs text-blue-600 hover:underline"
                  >
                    {a.partes[0].referencia}
                  </Link>
                )}
              </div>

              {/* Acciones admin */}
              {esAdmin && (
                <div className="mt-1.5 flex gap-3">
                  {enEdicion ? (
                    <>
                      <button onClick={() => guardar(a)} disabled={pending} className="text-xs font-medium text-green-700 hover:underline disabled:opacity-50">Guardar</button>
                      <button onClick={() => setEditando(null)} disabled={pending} className="text-xs text-gray-500 hover:underline">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => abrirEdicion(a)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => eliminar(a)} disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Eliminar</button>
                    </>
                  )}
                </div>
              )}

              {/* Partes del abono (al expandir o editar) */}
              {(expandido || enEdicion) && (
                <div className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
                  {a.partes.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <Link
                        href={p.origen === 'pedido' ? `/pedidos/${p.referencia_id}` : `/facturacion/${p.referencia_id}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {p.referencia}
                      </Link>
                      {enEdicion ? (
                        <input
                          type="number"
                          value={montos[p.id] ?? ''}
                          onChange={e => setMontos(m => ({ ...m, [p.id]: e.target.value }))}
                          className="w-24 text-right rounded border border-gray-300 px-2 py-1"
                        />
                      ) : (
                        <span className="text-gray-700">{formatCOP(p.monto)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600 uppercase">Total pagado</span>
        <span className="text-sm font-bold text-green-700">{formatCOP(totalPagado)}</span>
      </div>
    </div>
  )
}
