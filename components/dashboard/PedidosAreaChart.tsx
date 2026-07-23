'use client'

import {
  BarChart,
  Bar,
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
  por_sede?: Record<string, number>
}

interface Props {
  datos: DatoDia[]
  totalPedidos: number
  totalVentas: number
  desde: string
  hasta: string
}

// Color fijo por sede (mismas tres sedes del negocio)
const SEDES = [
  { codigo: 'TR', nombre: 'Bucaramanga', color: '#3b82f6' },  // azul
  { codigo: 'SR', nombre: 'Santa Rosa',  color: '#10b981' },  // verde
  { codigo: 'CR', nombre: 'Cúcuta',      color: '#8b5cf6' },  // morado
]

function labelFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function formatCOPShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

// Barras AGRUPADAS por día: una barra por sede (lado a lado), cada una con
// su color; el tooltip muestra el desglose y el total del día.
export function PedidosAreaChart({ datos, totalPedidos, totalVentas, desde, hasta }: Props) {
  // Llenar días faltantes con 0 y aplanar los conteos por sede
  const mapaFechas = new Map(datos.map(d => [d.fecha, d]))
  const dias: Array<{ fecha: string; label: string; TR: number; SR: number; CR: number; total: number }> = []
  const inicio = new Date(desde + 'T12:00:00Z')
  const fin = new Date(hasta + 'T12:00:00Z')
  for (const d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    const dia = mapaFechas.get(f)
    dias.push({
      fecha: f,
      label: '',
      TR: dia?.por_sede?.TR ?? 0,
      SR: dia?.por_sede?.SR ?? 0,
      CR: dia?.por_sede?.CR ?? 0,
      total: dia?.pedidos ?? 0,
    })
  }
  // Mostrar cada 5 días en el eje X
  dias.forEach((d, i) => {
    d.label = i % 5 === 0 || i === dias.length - 1 ? labelFecha(d.fecha) : ''
  })

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Pedidos por día y sede — últimos 30 días</h2>
          <p className="text-xs text-gray-400 mt-0.5">{labelFecha(desde)} → {labelFecha(hasta)}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {SEDES.map(s => (
              <span key={s.codigo} className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.nombre}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{totalPedidos}</p>
          <p className="text-xs text-gray-400">{formatCOPShort(totalVentas)} en ventas</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={dias} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%" barGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={0}
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
            formatter={(v, name) => [
              `${Number(v) || 0} pedido${Number(v) === 1 ? '' : 's'}`,
              SEDES.find(s => s.codigo === String(name))?.nombre ?? String(name),
            ]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload
              return p ? `${labelFecha(p.fecha)} — ${p.total} en total` : ''
            }}
            cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
          />
          {/* Agrupadas: una barra por sede, lado a lado en cada día */}
          <Bar dataKey="TR" fill="#3b82f6" maxBarSize={8} radius={[2, 2, 0, 0]} />
          <Bar dataKey="SR" fill="#10b981" maxBarSize={8} radius={[2, 2, 0, 0]} />
          <Bar dataKey="CR" fill="#8b5cf6" maxBarSize={8} radius={[2, 2, 0, 0]} />
        </BarChart>
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
