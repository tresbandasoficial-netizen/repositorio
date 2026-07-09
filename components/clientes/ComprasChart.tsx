import { formatCOP } from '@/lib/utils/format'

export type MesCompra = {
  clave: string      // 'YYYY-MM'
  label: string      // 'jul 26'
  total: number      // COP comprado ese mes
  pedidos: number    // cantidad de pedidos
}

// Gráfica de barras del flujo de compras del cliente, mes a mes.
// Server component puro (sin JS): las barras son divs con altura proporcional.
export function ComprasChart({ meses }: { meses: MesCompra[] }) {
  if (meses.length === 0) {
    return <p className="px-6 py-8 text-sm text-gray-400 text-center">Sin compras para graficar.</p>
  }

  const maxTotal = Math.max(...meses.map(m => m.total), 1)
  const totalGeneral = meses.reduce((s, m) => s + m.total, 0)
  const promedioMes = Math.round(totalGeneral / meses.length)
  const mejorMes = meses.reduce((a, b) => (b.total > a.total ? b : a))

  return (
    <div className="px-5 py-4">
      {/* Resumen arriba de la gráfica */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <div>
          <span className="text-gray-400">Promedio / mes</span>
          <p className="text-sm font-bold text-gray-900">{formatCOP(promedioMes)}</p>
        </div>
        <div>
          <span className="text-gray-400">Mejor mes</span>
          <p className="text-sm font-bold text-blue-600">{formatCOP(mejorMes.total)} <span className="font-normal text-gray-400">({mejorMes.label})</span></p>
        </div>
        <div>
          <span className="text-gray-400">Meses activos</span>
          <p className="text-sm font-bold text-gray-900">{meses.length}</p>
        </div>
      </div>

      {/* Barras */}
      <div className="flex items-end gap-2 sm:gap-3 h-52 overflow-x-auto pb-1">
        {meses.map(m => {
          const alturaPct = Math.max(4, Math.round((m.total / maxTotal) * 100))
          const esMejor = m.clave === mejorMes.clave
          return (
            <div key={m.clave} className="flex flex-col items-center justify-end flex-1 min-w-[42px] h-full group"
              title={`${m.label}: ${formatCOP(m.total)} · ${m.pedidos} pedido${m.pedidos !== 1 ? 's' : ''}`}>
              {/* Valor arriba de la barra */}
              <span className="text-[10px] font-semibold text-gray-500 mb-1 whitespace-nowrap">
                {m.total >= 1_000_000 ? `${(m.total / 1_000_000).toFixed(1)}M` : `${Math.round(m.total / 1000)}k`}
              </span>
              <div
                className={`w-full rounded-t-lg transition-colors ${
                  esMejor ? 'bg-blue-600' : 'bg-blue-300 group-hover:bg-blue-400'
                }`}
                style={{ height: `${alturaPct}%` }}
              />
              {/* Mes */}
              <span className="text-[10px] text-gray-400 mt-1.5 whitespace-nowrap">{m.label}</span>
              <span className="text-[9px] text-gray-300">{m.pedidos}p</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
