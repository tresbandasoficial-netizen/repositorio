import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEstadisticas } from '@/lib/queries/estadisticas'

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function labelDia(fecha: string) {
  return DIAS_SEMANA[new Date(fecha + 'T12:00:00Z').getUTCDay()]
}

function formatFechaCorta(fecha: string) {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

const PERIODOS = [
  { dias: 7,  label: '7 días' },
  { dias: 15, label: '15 días' },
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
]

const SEDE_LABELS: Record<string, string> = {
  TR: 'Bucaramanga',
  CR: 'Cúcuta',
  SR: 'Santa Rosa',
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { dias: diasParam } = await searchParams
  const dias = PERIODOS.some(p => p.dias === Number(diasParam)) ? Number(diasParam) : 30

  const stats = await getEstadisticas(dias)

  const maxPedidosDia = Math.max(1, ...stats.por_dia.map(d => d.pedidos))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Estadísticas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pedidos del {formatFechaCorta(stats.desde)} al {formatFechaCorta(stats.hasta)}
          </p>
        </div>
        {/* Selector de período */}
        <div className="flex gap-1.5">
          {PERIODOS.map(p => (
            <Link
              key={p.dias}
              href={`/estadisticas?dias=${p.dias}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                dias === p.dias
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Pedidos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total_pedidos}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Ventas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCOP(stats.total_ventas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Pedidos / día</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.promedio_diario}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Ticket promedio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCOP(stats.ticket_promedio)}</p>
        </div>
      </div>

      {/* Mejor día */}
      {stats.mejor_dia && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-lg">🏆</span>
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Mejor día:</span>{' '}
            {labelDia(stats.mejor_dia.fecha)} {formatFechaCorta(stats.mejor_dia.fecha)} con{' '}
            <span className="font-semibold">{stats.mejor_dia.pedidos} pedidos</span>{' '}
            ({formatCOP(stats.mejor_dia.ventas)})
          </p>
        </div>
      )}

      {stats.total_pedidos === 0 ? (
        <div className="text-center py-20 text-gray-400">No hay pedidos en este período</div>
      ) : (
        <div className="space-y-6">
          {/* Tabla: pedidos por día */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Pedidos por día</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">Fecha</th>
                    <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                    <th className="text-left px-4 py-2 font-medium w-1/4"></th>
                    <th className="text-right px-4 py-2 font-medium">Ventas</th>
                    <th className="text-right px-4 py-2 font-medium">Ticket prom.</th>
                    <th className="text-right px-4 py-2 font-medium">TR</th>
                    <th className="text-right px-4 py-2 font-medium">CR</th>
                    <th className="text-right px-4 py-2 font-medium">SR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.por_dia.map(d => (
                    <tr key={d.fecha} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-700">
                        <span className="font-medium">{labelDia(d.fecha)}</span>{' '}
                        <span className="text-gray-400">{formatFechaCorta(d.fecha)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{d.pedidos}</td>
                      <td className="px-4 py-2.5">
                        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.round((d.pedidos / maxPedidosDia) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{formatCOP(d.ventas)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{formatCOP(d.ticket_promedio)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{d.por_sede['TR'] ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{d.por_sede['CR'] ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{d.por_sede['SR'] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                    <td className="px-4 py-2.5 text-gray-500">Total</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">{stats.total_pedidos}</td>
                    <td />
                    <td className="px-4 py-2.5 text-right text-gray-900">{formatCOP(stats.total_ventas)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{formatCOP(stats.ticket_promedio)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tabla: por sede */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Por sede</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">Sede</th>
                  <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2 font-medium">Ventas</th>
                  <th className="text-right px-4 py-2 font-medium">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.por_sede.map(s => (
                  <tr key={s.sede_codigo} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{s.sede_codigo}</span>{' '}
                      <span className="text-gray-400">{SEDE_LABELS[s.sede_codigo] ?? ''}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{s.pedidos}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCOP(s.ventas)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {Math.round((s.pedidos / stats.total_pedidos) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tabla: por asesor */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Por asesor</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">Asesor</th>
                  <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2 font-medium">Ventas</th>
                  <th className="text-right px-4 py-2 font-medium">Ticket prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.por_asesor.map(a => (
                  <tr key={a.asesor_nombre} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{a.asesor_nombre}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{a.pedidos}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCOP(a.ventas)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">{formatCOP(a.ticket_promedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
