import { EstadisticaDia } from '@/lib/queries/estadisticas'
import { formatCOP, formatFecha } from '@/lib/utils/format'

// Sedes en orden fijo (el negocio tiene exactamente estas tres).
const SEDES = [
  { codigo: 'TR', nombre: 'Bucaramanga' },
  { codigo: 'CR', nombre: 'Cúcuta' },
  { codigo: 'SR', nombre: 'Santa Rosa' },
]

// Muestra, por día, cuánto se vendió en cada sede (monto), con totales del período.
export function VentasPorDiaSede({ dias }: { dias: EstadisticaDia[] }) {
  // Totales del período por sede (para el pie de tabla).
  const totalesSede: Record<string, number> = {}
  let totalGeneral = 0
  for (const d of dias) {
    for (const s of SEDES) {
      const v = d.ventas_por_sede[s.codigo] ?? 0
      totalesSede[s.codigo] = (totalesSede[s.codigo] ?? 0) + v
    }
    totalGeneral += d.ventas
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Ventas por día y sede</h2>
        <span className="text-xs text-gray-400">últimos 30 días</span>
      </div>

      {dias.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Sin ventas en el período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Día</th>
                {SEDES.map((s) => (
                  <th key={s.codigo} className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {s.nombre} <span className="text-gray-300">({s.codigo})</span>
                  </th>
                ))}
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dias.map((d) => (
                <tr key={d.fecha} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    {formatFecha(d.fecha)}
                    <span className="ml-2 text-xs font-normal text-gray-400">{d.pedidos} ped.</span>
                  </td>
                  {SEDES.map((s) => {
                    const v = d.ventas_por_sede[s.codigo] ?? 0
                    return (
                      <td key={s.codigo} className="px-5 py-3 text-right whitespace-nowrap">
                        {v > 0
                          ? <span className="font-medium text-gray-800">{formatCOP(v)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCOP(d.ventas)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-100 bg-gray-50/40">
                <td className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Total período</td>
                {SEDES.map((s) => (
                  <td key={s.codigo} className="px-5 py-3 text-right font-bold text-gray-700 whitespace-nowrap">
                    {formatCOP(totalesSede[s.codigo] ?? 0)}
                  </td>
                ))}
                <td className="px-5 py-3 text-right font-bold text-blue-700 whitespace-nowrap">{formatCOP(totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
