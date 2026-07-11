import { Fragment } from 'react'
import { EstadisticaDia } from '@/lib/queries/estadisticas'
import { formatCOP, formatFecha } from '@/lib/utils/format'

// Sedes en orden fijo (el negocio tiene exactamente estas tres).
const SEDES = [
  { codigo: 'TR', nombre: 'Bucaramanga' },
  { codigo: 'CR', nombre: 'Cúcuta' },
  { codigo: 'SR', nombre: 'Santa Rosa' },
]

// Celda de dinero: monto o guion si es cero.
function Monto({ valor, className = 'text-gray-800' }: { valor: number; className?: string }) {
  return valor > 0
    ? <span className={`font-medium ${className}`}>{formatCOP(valor)}</span>
    : <span className="text-gray-300">—</span>
}

// Muestra, por día, cuánto se vendió en cada sede separando Pedidos (encargos)
// de Tienda (venta inmediata), con totales del período.
export function VentasPorDiaSede({ dias }: { dias: EstadisticaDia[] }) {
  const tot: Record<string, { pedido: number; tienda: number }> = {}
  let granTotal = 0
  for (const d of dias) {
    for (const s of SEDES) {
      const v = d.ventas_por_sede_tipo[s.codigo] ?? { pedido: 0, tienda: 0 }
      const t = tot[s.codigo] ?? { pedido: 0, tienda: 0 }
      t.pedido += v.pedido
      t.tienda += v.tienda
      tot[s.codigo] = t
    }
    granTotal += d.ventas
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-gray-900">Ventas por día y sede</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Pedidos</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Tienda</span>
          <span className="text-gray-300">·</span>
          <span>últimos 30 días</span>
        </div>
      </div>

      {dias.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Sin ventas en el período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60">
                <th rowSpan={2} className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider align-bottom">Día</th>
                {SEDES.map((s, i) => (
                  <th key={s.codigo} colSpan={2} className={`text-center px-5 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider ${i > 0 ? 'border-l border-gray-100' : ''}`}>
                    {s.nombre} <span className="text-gray-300">({s.codigo})</span>
                  </th>
                ))}
                <th rowSpan={2} className="text-right px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wider align-bottom">Total</th>
              </tr>
              <tr className="bg-gray-50/60 border-b border-gray-100">
                {SEDES.map((s, i) => (
                  <Fragment key={s.codigo}>
                    <th className={`text-right px-5 py-2 text-[11px] font-semibold text-blue-600 ${i > 0 ? 'border-l border-gray-100' : ''}`}>Pedidos</th>
                    <th className="text-right px-5 py-2 text-[11px] font-semibold text-emerald-600">Tienda</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dias.map((d) => (
                <tr key={d.fecha} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    {formatFecha(d.fecha)}
                    <span className="ml-2 text-xs font-normal text-gray-400">{d.pedidos} ped.</span>
                  </td>
                  {SEDES.map((s, i) => {
                    const v = d.ventas_por_sede_tipo[s.codigo] ?? { pedido: 0, tienda: 0 }
                    return (
                      <Fragment key={s.codigo}>
                        <td className={`px-5 py-3 text-right whitespace-nowrap ${i > 0 ? 'border-l border-gray-100' : ''}`}>
                          <Monto valor={v.pedido} />
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <Monto valor={v.tienda} className="text-emerald-700" />
                        </td>
                      </Fragment>
                    )
                  })}
                  <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCOP(d.ventas)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-100 bg-gray-50/40">
                <td className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Total período</td>
                {SEDES.map((s, i) => {
                  const t = tot[s.codigo] ?? { pedido: 0, tienda: 0 }
                  return (
                    <Fragment key={s.codigo}>
                      <td className={`px-5 py-3 text-right font-bold text-gray-700 whitespace-nowrap ${i > 0 ? 'border-l border-gray-100' : ''}`}>
                        {formatCOP(t.pedido)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                        {formatCOP(t.tienda)}
                      </td>
                    </Fragment>
                  )
                })}
                <td className="px-5 py-3 text-right font-bold text-blue-700 whitespace-nowrap">{formatCOP(granTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
