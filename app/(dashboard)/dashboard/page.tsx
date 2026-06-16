import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMetricasAdmin, getMetricasAsesor, getMetricasPorSede, getMetricasPorAsesor, getUltimosPedidosAsesor } from '@/lib/queries/metricas'
import { getEstadisticas } from '@/lib/queries/estadisticas'
import { PedidosAreaChart } from '@/components/dashboard/PedidosAreaChart'
import { SedeDonutChart } from '@/components/dashboard/SedeDonutChart'
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

        {/* Gráficas */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Estadísticas</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <PedidosAreaChart
                datos={stats.por_dia}
                totalPedidos={stats.total_pedidos}
                totalVentas={stats.total_ventas}
                desde={stats.desde}
                hasta={stats.hasta}
              />
            </div>
            <SedeDonutChart
              sedes={stats.por_sede}
              totalPedidos={stats.total_pedidos}
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
      <PedidosAreaChart
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
