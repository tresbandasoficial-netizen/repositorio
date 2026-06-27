'use client'

import { Fragment, useState } from 'react'
import { formatCOP } from '@/lib/utils/format'
import type { CuadreMetodo } from '@/lib/queries/cuadre'

const ORIGEN_LABEL: Record<string, string> = { venta: 'venta', abono: 'abono', cartera: 'factura' }

// Tabla de métodos del cuadre. Cada método con movimiento se puede desplegar
// para ver los ingresos individuales (cada factura/pedido que lo compone).
export function MetodosCuadre({ metodos }: { metodos: CuadreMetodo[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)

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
                  {tieneDetalle && <span className="ml-1.5 text-[10px] text-gray-400">({m.detalle.length})</span>}
                </td>
                <td className="px-5 py-2 text-right font-medium text-gray-900">{m.monto ? formatCOP(m.monto) : '—'}</td>
              </tr>
              {expandido && m.detalle.map((d, i) => (
                <tr key={m.metodo + '-' + i} className="bg-gray-50/60 text-xs">
                  <td className="px-5 py-1.5 pl-10 text-gray-600">
                    <span className="font-mono">{d.referencia}</span>
                    <span className="ml-2 text-gray-400">{ORIGEN_LABEL[d.origen] ?? d.origen}</span>
                  </td>
                  <td className="px-5 py-1.5 text-right text-gray-700">{formatCOP(d.monto)}</td>
                </tr>
              ))}
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
