'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

interface DatoDia {
  fecha: string
  pedidos: number
  ventas: number
}

interface Props {
  datos: DatoDia[]
  totalPedidos: number
  totalVentas: number
  desde: string
  hasta: string
}

function labelFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function formatCOPShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

export function PedidosAreaChart({ datos, totalPedidos, totalVentas, desde, hasta }: Props) {
  // Llenar días faltantes con 0
  const mapaFechas = new Map(datos.map(d => [d.fecha, d]))
  const dias: DatoDia[] = []
  const inicio = new Date(desde + 'T12:00:00Z')
  const fin = new Date(hasta + 'T12:00:00Z')
  for (const d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    dias.push(mapaFechas.get(f) ?? { fecha: f, pedidos: 0, ventas: 0 })
  }

  // Mostrar cada 5 días en el eje X
  const datosTick = dias.map((d, i) => ({
    ...d,
    label: i % 5 === 0 || i === dias.length - 1 ? labelFecha(d.fecha) : '',
  }))

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Pedidos — últimos 30 días</h2>
          <p className="text-xs text-gray-400 mt-0.5">{labelFecha(desde)} → {labelFecha(hasta)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{totalPedidos}</p>
          <p className="text-xs text-gray-400">{formatCOPShort(totalVentas)} en ventas</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={datosTick} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradPedidos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#1e293b',
              border: 'none',
              borderRadius: '12px',
              color: '#f8fafc',
              fontSize: 12,
              padding: '8px 12px',
            }}
            formatter={(v) => [`${v ?? 0} pedidos`, '']}
            labelFormatter={(l) => l}
            cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          <Area
            type="monotone"
            dataKey="pedidos"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#gradPedidos)"
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <Link
        href="/estadisticas"
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
      >
        Ver estadísticas completas <ArrowUpRight size={11} />
      </Link>
    </div>
  )
}
