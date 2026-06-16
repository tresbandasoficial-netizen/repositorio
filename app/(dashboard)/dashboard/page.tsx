import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMetricasAdmin, getMetricasAsesor, getMetricasPorSede, getMetricasPorAsesor, getUltimosPedidosAsesor } from '@/lib/queries/metricas'
import { getEstadisticas, EstadisticaDia } from '@/lib/queries/estadisticas'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { EstadoPedido } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import {
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  Skull,
  Wallet,
  CreditCard,
  Package,
  Plus,
  ArrowUpRight,
  Store,
  BarChart2,
} from 'lucide-react'

// ── KPI card principal (gradiente azul) ───────────────────────────────────────
function KpiHero({
  label,
  valor,
  sub,
  icon: Icon,
}: {
  label: string
  valor: string | number
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-3xl p-5 text-white relative overflow-hidden shadow-lg shadow-blue-200">
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-8 top-8 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-semibold text-blue-100">{label}</p>
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Icon size={17} className="text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight mb-1">{valor}</p>
        {sub && <p className="text-sm text-blue-200">{sub}</p>}
      </div>
    </div>
  )
}

// ── KPI card secundaria (blanca) ──────────────────────────────────────────────
function KpiCard({
  label,
  valor,
  sub,
  alerta,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
}: {
  label: string
  valor: string | number
  sub?: string
  alerta?: boolean
  icon: React.ElementType
  iconColor?: string
  iconBg?: string
}) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <div className={`w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={17} className={alerta ? 'text-red-500' : iconColor} />
        </div>
      </div>
      <p className={`text-3xl font-bold tracking-tight mb-1 ${alerta ? 'text-red-600' : 'text-gray-900'}`}>
        {valor}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Bar chart de pedidos por día ──────────────────────────────────────────────
function BarChartPedidos({
  datos,
  totalPedidos,
  totalVentas,
  desde,
  hasta,
}: {
  datos: EstadisticaDia[]
  totalPedidos: number
  totalVentas: number
  desde: string
  hasta: string
}) {
  // Llenar todos los días del rango con ceros donde no haya datos
  const mapaFechas = new Map(datos.map(d => [d.fecha, d]))
  const dias: Array<{ fecha: string; pedidos: number }> = []
  const fechaInicio = new Date(desde + 'T12:00:00Z')
  const fechaFin = new Date(hasta + 'T12:00:00Z')
  for (const d = new Date(fechaInicio); d <= fechaFin; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    dias.push({ fecha: f, pedidos: mapaFechas.get(f)?.pedidos ?? 0 })
  }

  const maxPedidos = Math.max(1, ...dias.map(d => d.pedidos))
  const n = dias.length

  function labelFecha(fecha: string) {
    const d = new Date(fecha + 'T12:00:00Z')
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  }

  // Mostrar etiquetas cada ~10 días
  const indicesEtiqueta = new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1])

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Pedidos — últimos 30 días</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {labelFecha(desde)} → {labelFecha(hasta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{totalPedidos}</p>
          <p className="text-xs text-gray-400">{formatCOP(totalVentas)}</p>
        </div>
      </div>

      {/* Barras */}
      <div className="mt-4 flex items-end gap-[2px]" style={{ height: '100px' }}>
        {dias.map((d, i) => {
          const pct = Math.round((d.pedidos / maxPedidos) * 100)
          const esHoy = d.fecha === hasta
          return (
            <div
              key={d.fecha}
              className="flex-1 flex flex-col justify-end"
              title={`${labelFecha(d.fecha)}: ${d.pedidos} pedidos`}
            >
              <div
                className={`w-full rounded-t-sm transition-all ${
                  esHoy ? 'bg-blue-600' : d.pedidos > 0 ? 'bg-blue-400' : 'bg-gray-100'
                }`}
                style={{ height: `${Math.max(pct > 0 ? 8 : 3, pct)}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Eje X */}
      <div className="flex mt-2 relative" style={{ height: '16px' }}>
        {dias.map((d, i) => {
          if (!indicesEtiqueta.has(i)) return null
          const leftPct = (i / (n - 1)) * 100
          return (
            <span
              key={d.fecha}
              className="absolute text-[10px] text-gray-400 -translate-x-1/2"
              style={{ left: `${leftPct}%` }}
            >
              {labelFecha(d.fecha)}
            </span>
          )
        })}
      </div>

      <Link
        href="/estadisticas"
        className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
      >
        Ver estadísticas completas <ArrowUpRight size={11} />
      </Link>
    </div>
  )
}

// ── Métodos de pago — barras horizontales ─────────────────────────────────────
function MetodosPagoChart({
  datos,
  totalRecaudado,
}: {
  datos: Array<{ metodo: string; monto: number; porcentaje_monto: number; count: number }>
  totalRecaudado: number
}) {
  const colores: Record<string, string> = {
    efectivo:      'bg-emerald-500',
    transferencia: 'bg-blue-500',
    datafono:      'bg-violet-500',
    addi:          'bg-pink-500',
    bold:          'bg-orange-500',
    sistecredito:  'bg-yellow-500',
    credito:       'bg-red-400',
    otro:          'bg-gray-400',
  }

  const top = datos.slice(0, 5)

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Métodos de pago</h2>
          <p className="text-xs text-gray-400 mt-0.5">Últimos 30 días</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">{formatCOP(totalRecaudado)}</p>
          <p className="text-xs text-gray-400">recaudado</p>
        </div>
      </div>

      <div className="space-y-3">
        {top.map((m) => (
          <div key={m.metodo}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-700 capitalize">{m.metodo}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{m.count} pagos</span>
                <span className="text-xs font-bold text-gray-900">{m.porcentaje_monto}%</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${colores[m.metodo] ?? 'bg-gray-400'}`}
                style={{ width: `${m.porcentaje_monto}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tabla de sedes / asesores ─────────────────────────────────────────────────
function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Link rápido ───────────────────────────────────────────────────────────────
function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  return (
    <Link href={href} className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all group">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center">
          <Icon size={16} className="text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">{label}</span>
      </div>
      <ArrowUpRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const esAdmin = usuario.rol === 'admin'

  // ── Vista Admin ──────────────────────────────────────────────────────────────
  if (esAdmin) {
    const [m, sedes, asesores, stats] = await Promise.all([
      getMetricasAdmin(),
      getMetricasPorSede(),
      getMetricasPorAsesor(),
      getEstadisticas(30),
    ])

    return (
      <div className="p-5 md:p-6 space-y-5 max-w-7xl">

        {/* Alerta crítica */}
        {(m.pedidos_en_alerta > 0 || m.pedidos_zombie > 0) && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={17} className="text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800">
                {m.pedidos_en_alerta + m.pedidos_zombie} pedidos requieren atención
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                {m.pedidos_en_alerta} con tiempo excedido · {m.pedidos_zombie} zombis
              </p>
            </div>
            <Link href="/pedidos?alerta=1" className="shrink-0 flex items-center gap-1 text-sm font-bold text-red-700 hover:text-red-900">
              Ver <ArrowUpRight size={13} />
            </Link>
          </div>
        )}

        {/* KPI row 1 — Pedidos */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Pedidos</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiHero
              label="Ventas del mes"
              valor={formatCOP(m.ventas_mes)}
              sub={`${m.pedidos_mes} pedidos este mes`}
              icon={TrendingUp}
            />
            <KpiCard label="Hoy"          valor={m.pedidos_hoy}    sub={formatCOP(m.ventas_hoy)}    icon={ShoppingBag} iconColor="text-violet-600" iconBg="bg-violet-50" />
            <KpiCard label="Esta semana"  valor={m.pedidos_semana} sub={formatCOP(m.ventas_semana)} icon={Package}     iconColor="text-sky-600"    iconBg="bg-sky-50" />
            <KpiCard label="Ticket prom." valor={formatCOP(m.ticket_promedio)}                       icon={CreditCard}  iconColor="text-amber-600"  iconBg="bg-amber-50" />
          </div>
        </div>

        {/* KPI row 2 — Cartera */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Cartera</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Abonos del mes"  valor={formatCOP(m.abonos_mes)}    icon={Wallet}        iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="Cartera total"   valor={formatCOP(m.cartera_saldo)} sub={`${m.cartera_clientes} clientes`} icon={CreditCard} iconColor="text-orange-600" iconBg="bg-orange-50" alerta={m.cartera_saldo > 0} />
            <KpiCard label="En alerta"       valor={m.pedidos_en_alerta}         icon={AlertTriangle} iconColor="text-red-500"     iconBg="bg-red-50"     alerta={m.pedidos_en_alerta > 0} />
            <KpiCard label="Zombis"          valor={m.pedidos_zombie}             icon={Skull}         iconColor="text-orange-500"  iconBg="bg-orange-50"  alerta={m.pedidos_zombie > 0} />
          </div>
        </div>

        {/* Gráficas de estadísticas */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Estadísticas</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <BarChartPedidos
                datos={stats.por_dia}
                totalPedidos={stats.total_pedidos}
                totalVentas={stats.total_ventas}
                desde={stats.desde}
                hasta={stats.hasta}
              />
            </div>
            <MetodosPagoChart
              datos={stats.por_metodo_pago}
              totalRecaudado={stats.total_recaudado}
            />
          </div>
        </div>

        {/* Tablas + accesos rápidos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TableCard title="Por sede">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Sede</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Activos</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Alertas</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Ventas (30d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sedes.map((s) => (
                    <tr key={s.sede_codigo} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                            <Store size={14} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{s.sede_nombre}</p>
                            <p className="text-xs text-gray-400">{s.sede_codigo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-700">{s.pedidos_activos}</td>
                      <td className="px-5 py-3.5 text-right">
                        {s.pedidos_en_alerta > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                            {s.pedidos_en_alerta}
                          </span>
                        ) : (
                          <span className="text-gray-300 font-medium">0</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCOP(s.ventas_mes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>

          {/* Accesos rápidos */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Accesos rápidos</p>
            <Link
              href="/pedidos/nuevo"
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl py-3.5 transition-colors shadow-md shadow-blue-200 w-full"
            >
              <Plus size={16} />
              Nuevo pedido
            </Link>
            <QuickLink href="/pedidos"      label="Ver pedidos"    icon={Package} />
            <QuickLink href="/clientes"     label="Clientes"       icon={TrendingUp} />
            <QuickLink href="/cartera"      label="Cartera"        icon={Wallet} />
            <QuickLink href="/estadisticas" label="Estadísticas"   icon={BarChart2} />
          </div>
        </div>

        {/* Por asesor */}
        {asesores.length > 0 && (
          <TableCard title="Por asesor (30 días)">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Asesor</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Pedidos</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Ventas</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Ticket prom.</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Activos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {asesores.map((a) => (
                  <tr key={a.asesor_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-blue-700">{a.asesor_nombre.charAt(0)}</span>
                        </div>
                        <span className="font-semibold text-gray-900">{a.asesor_nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-700">{a.pedidos_mes}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCOP(a.ventas_mes)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500">{formatCOP(a.ticket_promedio)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-700">{a.pedidos_activos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>
    )
  }

  // ── Vista Asesor ─────────────────────────────────────────────────────────────
  const [m, ultimosPedidos, stats] = await Promise.all([
    getMetricasAsesor(usuario.id),
    getUltimosPedidosAsesor(usuario.id),
    getEstadisticas(30),
  ])

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-3xl">

      {m.pedidos_en_alerta > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={17} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {m.pedidos_en_alerta} {m.pedidos_en_alerta === 1 ? 'pedido requiere' : 'pedidos requieren'} atención
            </p>
          </div>
          <Link href="/pedidos" className="text-sm font-bold text-amber-700 hover:text-amber-900">
            Ver →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <KpiHero
          label="Ventas del mes"
          valor={formatCOP(m.ventas_mes)}
          sub={`Ticket: ${formatCOP(m.ticket_promedio)}`}
          icon={TrendingUp}
        />
        <KpiCard label="Pedidos activos" valor={m.pedidos_activos}   icon={Package}       iconColor="text-sky-600"     iconBg="bg-sky-50" />
        <KpiCard label="En alerta"       valor={m.pedidos_en_alerta} icon={AlertTriangle} iconColor="text-red-500"     iconBg="bg-red-50" alerta={m.pedidos_en_alerta > 0} />
        <KpiCard label="Ticket promedio" valor={formatCOP(m.ticket_promedio)} icon={CreditCard} iconColor="text-violet-600" iconBg="bg-violet-50" />
      </div>

      {/* Gráfica */}
      <BarChartPedidos
        datos={stats.por_dia}
        totalPedidos={stats.total_pedidos}
        totalVentas={stats.total_ventas}
        desde={stats.desde}
        hasta={stats.hasta}
      />

      {ultimosPedidos.length > 0 && (
        <TableCard title="Pedidos activos">
          <div className="divide-y divide-gray-50">
            {ultimosPedidos.map((p) => (
              <Link
                key={p.id}
                href={`/pedidos/${p.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
              >
                <span className="font-mono text-sm font-bold text-gray-900 w-20 shrink-0">{p.numero_orden}</span>
                <span className="flex-1 text-sm text-gray-600 truncate">{p.cliente_nombre}</span>
                <EstadoBadge estado={p.estado as EstadoPedido} enAlerta={p.en_alerta} />
                <ArrowUpRight size={13} className="text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        </TableCard>
      )}

      <div className="flex gap-3">
        <Link
          href="/pedidos/nuevo"
          className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition-colors shadow-md shadow-blue-200"
        >
          <Plus size={15} />
          Nuevo pedido
        </Link>
        <Link
          href="/pedidos"
          className="px-5 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-2xl transition-colors"
        >
          Ver mis pedidos
        </Link>
      </div>
    </div>
  )
}
