'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
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
  ventas_por_sede_tipo?: Record<string, { pedido: number; tienda: number }>
}

// Filtro de sede del panel (los datos por sede ya vienen en cada día)
type SedeFiltro = 'ALL' | 'TR' | 'SR' | 'CR'
const SEDES_FILTRO: Array<{ codigo: SedeFiltro; nombre: string }> = [
  { codigo: 'ALL', nombre: 'Todas' },
  { codigo: 'TR', nombre: 'Bucaramanga' },
  { codigo: 'SR', nombre: 'Santa Rosa' },
  { codigo: 'CR', nombre: 'Cúcuta' },
]

function pedidosDia(d: DatoDia, sede: SedeFiltro): number {
  return sede === 'ALL' ? d.pedidos : (d.por_sede?.[sede] ?? 0)
}
function ventasDia(d: DatoDia, sede: SedeFiltro): number {
  if (sede === 'ALL') return d.ventas
  const v = d.ventas_por_sede_tipo?.[sede]
  return (v?.pedido ?? 0) + (v?.tienda ?? 0)
}

interface Props {
  datos: DatoDia[]
  datosPrevios?: DatoDia[]   // los 30 días ANTERIORES, para comparar
  totalPedidos: number
  totalVentas: number
  desde: string
  hasta: string
}

type Metrica = 'ventas' | 'pedidos' | 'ticket'

function labelFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z')
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function formatCOP(v: number) {
  return `$ ${Math.round(v).toLocaleString('es-CO')}`
}
function formatValor(metrica: Metrica, v: number) {
  return metrica === 'pedidos' ? String(Math.round(v)) : formatCOP(v)
}

// Estilo "información general": tarjetas de métricas arriba (con el cambio %
// frente a los 30 días anteriores) y la gráfica de línea de la métrica elegida,
// con el período anterior punteado para comparar.
export function PedidosAreaChart({ datos, datosPrevios = [], desde, hasta }: Props) {
  const [metrica, setMetrica] = useState<Metrica>('ventas')
  const [sede, setSede] = useState<SedeFiltro>('ALL')

  // ── Serie diaria del período actual (rellenando días sin ventas) ────────────
  // Los montos y conteos se toman de la sede elegida (o de todas).
  const mapaFechas = new Map(datos.map(d => [d.fecha, d]))
  const dias: Array<{ fecha: string; label: string; pedidos: number; ventas: number }> = []
  const inicio = new Date(desde + 'T12:00:00Z')
  const fin = new Date(hasta + 'T12:00:00Z')
  for (const d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    const x = mapaFechas.get(f)
    dias.push({ fecha: f, label: '', pedidos: x ? pedidosDia(x, sede) : 0, ventas: x ? ventasDia(x, sede) : 0 })
  }
  dias.forEach((d, i) => { d.label = i % 5 === 0 || i === dias.length - 1 ? labelFecha(d.fecha) : '' })

  // ── Serie del período anterior, alineada por posición (día 1 con día 1…) ────
  const prevOrdenado = [...datosPrevios].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const prevMapa = new Map(prevOrdenado.map(d => [d.fecha, d]))
  const prevSerie: Array<{ pedidos: number; ventas: number; fecha: string }> = []
  if (datosPrevios.length > 0) {
    const pIni = new Date(desde + 'T12:00:00Z'); pIni.setDate(pIni.getDate() - dias.length)
    for (let i = 0; i < dias.length; i++) {
      const d = new Date(pIni); d.setDate(d.getDate() + i)
      const f = d.toISOString().slice(0, 10)
      const x = prevMapa.get(f)
      prevSerie.push({ fecha: f, pedidos: x ? pedidosDia(x, sede) : 0, ventas: x ? ventasDia(x, sede) : 0 })
    }
  }

  const valorDia = (d: { pedidos: number; ventas: number }): number =>
    metrica === 'ventas' ? d.ventas
    : metrica === 'pedidos' ? d.pedidos
    : (d.pedidos > 0 ? Math.round(d.ventas / d.pedidos) : 0)

  const serie = dias.map((d, i) => ({
    ...d,
    valor: valorDia(d),
    previo: prevSerie[i] ? valorDia(prevSerie[i]) : null,
    fechaPrevia: prevSerie[i]?.fecha ?? null,
  }))

  // ── Totales (de la sede elegida) y cambio % frente al período anterior ──────
  const ventasSede  = dias.reduce((s, d) => s + d.ventas, 0)
  const pedidosSede = dias.reduce((s, d) => s + d.pedidos, 0)
  const ticketActual = pedidosSede > 0 ? Math.round(ventasSede / pedidosSede) : 0
  const prevVentas  = prevSerie.reduce((s, d) => s + d.ventas, 0)
  const prevPedidos = prevSerie.reduce((s, d) => s + d.pedidos, 0)
  const prevTicket  = prevPedidos > 0 ? Math.round(prevVentas / prevPedidos) : 0

  const cambio = (actual: number, previo: number): number | null =>
    datosPrevios.length === 0 || previo === 0 ? null : ((actual - previo) / previo) * 100

  const TARJETAS: Array<{ id: Metrica; titulo: string; valor: string; cambio: number | null }> = [
    { id: 'ventas',  titulo: 'Total ventas',    valor: formatCOP(ventasSede),   cambio: cambio(ventasSede, prevVentas) },
    { id: 'pedidos', titulo: 'Pedidos',         valor: String(pedidosSede),     cambio: cambio(pedidosSede, prevPedidos) },
    { id: 'ticket',  titulo: 'Ticket promedio', valor: formatCOP(ticketActual), cambio: cambio(ticketActual, prevTicket) },
  ]

  const ejeY = (v: number) =>
    metrica === 'pedidos' ? String(v)
    : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1).replace('.0', '')}M`
    : v >= 1_000 ? `$${Math.round(v / 1_000)}K`
    : `$${v}`

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="text-sm font-bold text-gray-900">Información general — últimos 30 días</h2>
        {/* Selector de sede: filtra tarjetas y gráfica al instante */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {SEDES_FILTRO.map(s => (
            <button
              key={s.codigo}
              onClick={() => setSede(s.codigo)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                sede === s.codigo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas de métricas: la elegida se resalta y manda la gráfica */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {TARJETAS.map(t => {
          const activa = metrica === t.id
          return (
            <button
              key={t.id}
              onClick={() => setMetrica(t.id)}
              className={`text-left rounded-xl border px-3.5 py-2.5 transition-all ${
                activa ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-200' : 'bg-white border-gray-200 hover:border-blue-300'
              }`}
            >
              <p className={`text-xs font-medium ${activa ? 'text-blue-100' : 'text-gray-500'}`}>{t.titulo}</p>
              <p className={`text-base font-bold flex items-center gap-1.5 flex-wrap ${activa ? 'text-white' : 'text-gray-900'}`}>
                {t.valor}
                {t.cambio !== null && (
                  <span className={`text-xs font-semibold ${
                    activa ? (t.cambio >= 0 ? 'text-green-200' : 'text-red-200')
                    : (t.cambio >= 0 ? 'text-green-600' : 'text-red-500')
                  }`}>
                    {t.cambio >= 0 ? '↗' : '↘'} {Math.abs(t.cambio).toFixed(1)}%
                  </span>
                )}
              </p>
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={serie} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradMetrica" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={ejeY} width={54} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#f8fafc', fontSize: 12, padding: '8px 12px' }}
            formatter={(v, name, item) => {
              const p: any = item?.payload
              if (name === 'previo') {
                return [formatValor(metrica, Number(v) || 0), `Período anterior${p?.fechaPrevia ? ` (${labelFecha(p.fechaPrevia)})` : ''}`]
              }
              return [formatValor(metrica, Number(v) || 0), TARJETAS.find(t => t.id === metrica)?.titulo ?? '']
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload
              return p ? labelFecha(p.fecha) : ''
            }}
            cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 2' }}
          />
          {/* Período anterior punteado, para comparar */}
          {prevSerie.length > 0 && (
            <Line type="linear" dataKey="previo" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, fill: '#93c5fd' }} />
          )}
          {/* Métrica elegida */}
          <Area type="linear" dataKey="valor" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradMetrica)" dot={false} activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-blue-500 inline-block" /> {labelFecha(desde)} → {labelFecha(hasta)}</span>
          {prevSerie.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-blue-300 inline-block" /> 30 días anteriores
            </span>
          )}
        </div>
        <Link href="/estadisticas" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold">
          Ver estadísticas completas <ArrowUpRight size={11} />
        </Link>
      </div>
    </div>
  )
}
