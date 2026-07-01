'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { formatCOP } from '@/lib/utils/format'
import { requiereConfirmacion } from '@/types'
import type { CuadreMetodo } from '@/lib/queries/cuadre'
import { confirmarPagoCuadreAction } from '@/app/actions/cuadre'

const ORIGEN_LABEL: Record<string, string> = { venta: 'venta', abono: 'abono', cartera: 'factura' }

// Tabla de métodos del cuadre. Cada método se despliega para ver sus ingresos
// (cada factura/pedido) y permite chulear cada uno = confirmar que el dinero entró.
export function MetodosCuadre({ metodos }: { metodos: CuadreMetodo[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [confirmados, setConfirmados] = useState<Set<string>>(
    () => new Set(metodos.flatMap(m => m.detalle.filter(d => d.confirmado).map(d => d.id)))
  )
  const [, start] = useTransition()

  function toggle(id: string, origen: string) {
    const nuevo = !confirmados.has(id)
    setConfirmados(prev => {
      const s = new Set(prev)
      if (nuevo) s.add(id); else s.delete(id)
      return s
    })
    start(async () => {
      const r = await confirmarPagoCuadreAction(id, origen, nuevo)
      if (!r.ok) {
        // revertir si falla
        setConfirmados(prev => {
          const s = new Set(prev)
          if (nuevo) s.delete(id); else s.add(id)
          return s
        })
      }
    })
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-y border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
          <th className="text-left px-5 py-2">Método</th>
          <th className="text-right px-5 py-2">Recaudado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {metodos.map(m => {
          const tieneDetalle = m.detalle.length > 0
          const expandido = abierto === m.metodo
          const confirmable = requiereConfirmacion(m.metodo)
          const conf = m.detalle.filter(d => confirmados.has(d.id)).length
          const todos = tieneDetalle && conf === m.detalle.length
          return (
            <Fragment key={m.metodo}>
              <tr
                className={`${m.monto === 0 ? 'text-gray-400' : ''} ${tieneDetalle ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={tieneDetalle ? () => setAbierto(expandido ? null : m.metodo) : undefined}
              >
                <td className="px-5 py-2">
                  {tieneDetalle && <span className="text-gray-400 mr-1 inline-block w-3">{expandido ? '▾' : '▸'}</span>}
                  {m.label}
                  {m.tipo === 'mensajeria' && <span className="ml-1.5 text-[10px] text-amber-600">por cobrar</span>}
                  {m.tipo === 'credito' && <span className="ml-1.5 text-[10px] text-gray-400">a crédito</span>}
                  {!m.esperado && m.monto > 0 && <span className="ml-1.5 text-[10px] text-purple-500">no esperado</span>}
                  {tieneDetalle && confirmable && (
                    <span className={`ml-1.5 text-[10px] font-medium ${todos ? 'text-green-600' : 'text-gray-400'}`}>
                      {todos ? '✓ confirmado' : `${conf}/${m.detalle.length} confirmados`}
                    </span>
                  )}
                </td>
                <td className="px-5 py-2 text-right font-medium text-gray-900">{m.monto ? formatCOP(m.monto) : '—'}</td>
              </tr>
              {expandido && m.detalle.map((d, i) => {
                const ok = confirmable && confirmados.has(d.id)
                return (
                  <tr key={m.metodo + '-' + i} className={`text-xs ${ok ? 'bg-green-50' : 'bg-gray-50/60'}`}>
                    <td className="px-5 py-1.5 pl-10">
                      <span className="flex items-center gap-2">
                        {confirmable && (
                          <input
                            type="checkbox"
                            checked={ok}
                            onChange={() => toggle(d.id, d.origen)}
                            className="w-4 h-4 accent-green-600 cursor-pointer"
                            title="Confirmar que el dinero entró"
                          />
                        )}
                        {d.origen === 'cartera' ? (
                          <Link
                            href={`/facturacion/n/${encodeURIComponent(d.referencia)}`}
                            className={`font-mono hover:underline ${ok ? 'text-green-700 font-medium' : 'text-blue-600'}`}
                          >
                            {d.referencia}
                          </Link>
                        ) : (
                          <span className={`font-mono ${ok ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{d.referencia}</span>
                        )}
                        <span className="text-gray-400">{ORIGEN_LABEL[d.origen] ?? d.origen}</span>
                      </span>
                    </td>
                    <td className={`px-5 py-1.5 text-right ${ok ? 'text-green-700 font-medium' : 'text-gray-700'}`}>{formatCOP(d.monto)}</td>
                  </tr>
                )
              })}
            </Fragment>
          )
        })}
        {metodos.length === 0 && (
          <tr><td colSpan={2} className="px-5 py-3 text-gray-400 text-center">Sin recaudo</td></tr>
        )}
      </tbody>
    </table>
  )
}
