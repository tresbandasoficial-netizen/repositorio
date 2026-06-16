'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Sede {
  sede_codigo: string
  pedidos: number
  ventas: number
}

interface Props {
  sedes: Sede[]
  totalPedidos: number
}

const COLORES: Record<string, string> = {
  TR: '#3b82f6',
  CR: '#93c5fd',
  SR: '#bfdbfe',
}

const SEDE_NOMBRES: Record<string, string> = {
  TR: 'Bucaramanga',
  CR: 'Cúcuta',
  SR: 'Santa Rosa',
}

export function SedeDonutChart({ sedes, totalPedidos }: Props) {
  const data = sedes.map(s => ({
    name: s.sede_codigo,
    value: s.pedidos,
    pct: totalPedidos > 0 ? Math.round((s.pedidos / totalPedidos) * 100) : 0,
  }))

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Por sede</h2>
          <p className="text-xs text-gray-400 mt-0.5">Últimos 30 días</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Donut */}
        <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={58}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORES[entry.name] ?? '#e2e8f0'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: 12,
                  padding: '6px 10px',
                }}
                formatter={(v, _, props: any) => [`${v ?? 0} pedidos (${props.payload?.pct ?? 0}%)`, props.payload?.name ?? '']}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-xl font-bold text-gray-900">{totalPedidos}</p>
            <p className="text-[10px] text-gray-400">pedidos</p>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex-1 space-y-2.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES[d.name] ?? '#e2e8f0' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700">
                  {SEDE_NOMBRES[d.name] ?? d.name}
                  <span className="text-gray-400 font-normal ml-1">({d.name})</span>
                </p>
              </div>
              <span className="text-xs font-bold text-gray-900">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
