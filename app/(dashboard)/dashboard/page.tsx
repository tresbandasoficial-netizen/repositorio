import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMetricasAdmin, getMetricasAsesor, getMetricasPorSede, getMetricasPorAsesor, getUltimosPedidosAsesor } from '@/lib/queries/metricas'
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
  Calendar,
  Plus,
  ArrowRight,
} from 'lucide-react'

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
  icon?: React.ElementType
  iconColor?: string
  iconBg?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden">
      {Icon && (
        <div className={`absolute right-4 top-4 w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon size={18} className={alerta ? 'text-red-500' : iconColor} />
        </div>
      )}
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2 pr-12">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${alerta ? 'text-red-600' : 'text-gray-900'}`}>
        {valor}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-1 h-4 rounded-full bg-blue-600" />
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{children}</h2>
    </div>
  )
}

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

  if (esAdmin) {
    const [m, sedes, asesores] = await Promise.all([getMetricasAdmin(), getMetricasPorSede(), getMetricasPorAsesor()])

    return (
      <div className="p-6 max-w-6xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Resumen general de la operación</p>
        </div>

        {/* Alertas */}
        {(m.pedidos_en_alerta > 0 || m.pedidos_zombie > 0) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {m.pedidos_en_alerta + m.pedidos_zombie} pedidos requieren atención
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                {m.pedidos_en_alerta} con tiempo excedido · {m.pedidos_zombie} zombis
              </p>
            </div>
            <Link
              href="/pedidos?alerta=1"
              className="shrink-0 flex items-center gap-1 text-sm font-semibold text-red-700 hover:text-red-900"
            >
              Ver <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* KPIs — Pedidos */}
        <section className="mb-8">
          <SectionHeader>Pedidos</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Hoy"           valor={m.pedidos_hoy}    sub={formatCOP(m.ventas_hoy)}    icon={Calendar}   iconColor="text-violet-600" iconBg="bg-violet-50" />
            <KpiCard label="Esta semana"   valor={m.pedidos_semana} sub={formatCOP(m.ventas_semana)} icon={TrendingUp}  iconColor="text-blue-600"   iconBg="bg-blue-50" />
            <KpiCard label="Este mes"      valor={m.pedidos_mes}    sub={formatCOP(m.ventas_mes)}    icon={ShoppingBag} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="Ticket prom."  valor={formatCOP(m.ticket_promedio)}                      icon={CreditCard}  iconColor="text-amber-600"  iconBg="bg-amber-50" />
          </div>
        </section>

        {/* KPIs — Cartera */}
        <section className="mb-8">
          <SectionHeader>Pagos y cartera</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Abonos del mes"  valor={formatCOP(m.abonos_mes)}   icon={Wallet}        iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="Cartera total"   valor={formatCOP(m.cartera_saldo)} sub={`${m.cartera_clientes} clientes`} icon={CreditCard} iconColor="text-orange-600" iconBg="bg-orange-50" alerta={m.cartera_saldo > 0} />
            <KpiCard label="En alerta"       valor={m.pedidos_en_alerta}        icon={AlertTriangle} iconColor="text-red-600"    iconBg="bg-red-50"     alerta={m.pedidos_en_alerta > 0} />
            <KpiCard label="Zombis"          valor={m.pedidos_zombie}            icon={Skull}         iconColor="text-orange-600" iconBg="bg-orange-50"  alerta={m.pedidos_zombie > 0} />
          </div>
        </section>

        {/* Por sede */}
        <section className="mb-8">
          <SectionHeader>Por sede</SectionHeader>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sede</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Activos</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Alertas</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ventas (30d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sedes.map((s) => (
                  <tr key={s.sede_codigo} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-gray-900">
                      {s.sede_nombre}
                      <span className="text-gray-400 font-normal ml-1.5 text-xs bg-gray-100 px-1.5 py-0.5 rounded-md">{s.sede_codigo}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-700 font-medium">{s.pedidos_activos}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-semibold ${s.pedidos_en_alerta > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {s.pedidos_en_alerta}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCOP(s.ventas_mes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Por asesor */}
        {asesores.length > 0 && (
          <section className="mb-8">
            <SectionHeader>Por asesor (30 días)</SectionHeader>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Asesor</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Pedidos</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ventas</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ticket prom.</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Activos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {asesores.map((a) => (
                    <tr key={a.asesor_id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-blue-700">{a.asesor_nombre.charAt(0)}</span>
                          </div>
                          <span className="font-semibold text-gray-900">{a.asesor_nombre}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-700 font-medium">{a.pedidos_mes}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-900">{formatCOP(a.ventas_mes)}</td>
                      <td className="px-5 py-3.5 text-right text-gray-500">{formatCOP(a.ticket_promedio)}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700 font-medium">{a.pedidos_activos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Accesos rápidos */}
        <section>
          <SectionHeader>Accesos rápidos</SectionHeader>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/pedidos/nuevo"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-blue-200"
            >
              <Plus size={15} />
              Nuevo pedido
            </Link>
            <Link href="/pedidos"   className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors">Ver pedidos</Link>
            <Link href="/clientes"  className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors">Ver clientes</Link>
            <Link href="/cartera"   className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors">Ver cartera</Link>
          </div>
        </section>
      </div>
    )
  }

  // Vista asesor
  const [m, ultimosPedidos] = await Promise.all([
    getMetricasAsesor(usuario.id),
    getUltimosPedidosAsesor(usuario.id),
  ])

  const primerNombre = usuario.nombre.split(' ')[0]

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Hola, {primerNombre}</h1>
        <p className="text-sm text-gray-400 mt-0.5">Resumen de tu actividad</p>
      </div>

      {m.pedidos_en_alerta > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {m.pedidos_en_alerta} {m.pedidos_en_alerta === 1 ? 'pedido requiere' : 'pedidos requieren'} atención
            </p>
          </div>
          <Link href="/pedidos" className="text-sm font-semibold text-amber-700 hover:text-amber-900">
            Ver →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-8">
        <KpiCard label="Pedidos activos" valor={m.pedidos_activos}    icon={ShoppingBag} iconColor="text-blue-600"   iconBg="bg-blue-50" />
        <KpiCard label="En alerta"       valor={m.pedidos_en_alerta}  icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50"  alerta={m.pedidos_en_alerta > 0} />
        <KpiCard label="Ventas del mes"  valor={formatCOP(m.ventas_mes)}   icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <KpiCard label="Ticket promedio" valor={formatCOP(m.ticket_promedio)} icon={CreditCard} iconColor="text-violet-600" iconBg="bg-violet-50" />
      </div>

      {ultimosPedidos.length > 0 && (
        <section className="mb-8">
          <SectionHeader>Pedidos activos</SectionHeader>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {ultimosPedidos.map((p) => (
              <Link
                key={p.id}
                href={`/pedidos/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors"
              >
                <span className="font-mono text-sm font-bold text-gray-900 w-20 shrink-0">{p.numero_orden}</span>
                <span className="flex-1 text-sm text-gray-600 truncate">{p.cliente_nombre}</span>
                <EstadoBadge estado={p.estado as EstadoPedido} enAlerta={p.en_alerta} />
                <span className="text-gray-300 text-sm">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Link
          href="/pedidos/nuevo"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-blue-200"
        >
          <Plus size={15} />
          Nuevo pedido
        </Link>
        <Link
          href="/pedidos"
          className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
        >
          Ver mis pedidos
        </Link>
      </div>
    </div>
  )
}
