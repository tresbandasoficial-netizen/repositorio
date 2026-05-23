import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMetricasAdmin, getMetricasAsesor } from '@/lib/queries/metricas'
import { formatCOP } from '@/lib/utils/format'
import { Card, CardContent } from '@/components/ui/Card'

function KpiCard({
  label,
  valor,
  sub,
  alerta,
}: {
  label: string
  valor: string | number
  sub?: string
  alerta?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
        <p className={`text-2xl font-bold ${alerta ? 'text-red-600' : 'text-gray-900'}`}>
          {valor}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
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

  const esAdmin = usuario.rol === 'admin'

  if (esAdmin) {
    const m = await getMetricasAdmin()

    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Alertas — primero si hay */}
        {(m.pedidos_en_alerta > 0 || m.pedidos_zombie > 0) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {m.pedidos_en_alerta + m.pedidos_zombie} pedidos requieren atención
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {m.pedidos_en_alerta} con tiempo excedido · {m.pedidos_zombie} zombis
              </p>
            </div>
            <Link
              href="/pedidos?alerta=1"
              className="text-sm font-medium text-red-700 hover:text-red-900 underline"
            >
              Ver pedidos →
            </Link>
          </div>
        )}

        {/* Pedidos */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pedidos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Hoy"       valor={m.pedidos_hoy}    sub={formatCOP(m.ventas_hoy)} />
            <KpiCard label="Semana"    valor={m.pedidos_semana} sub={formatCOP(m.ventas_semana)} />
            <KpiCard label="Mes"       valor={m.pedidos_mes}    sub={formatCOP(m.ventas_mes)} />
            <KpiCard label="Ticket promedio (mes)" valor={formatCOP(m.ticket_promedio)} />
          </div>
        </section>

        {/* Pagos */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pagos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Abonos del mes" valor={formatCOP(m.abonos_mes)} />
            <KpiCard
              label="En alerta"
              valor={m.pedidos_en_alerta}
              alerta={m.pedidos_en_alerta > 0}
            />
            <KpiCard
              label="Zombis"
              valor={m.pedidos_zombie}
              alerta={m.pedidos_zombie > 0}
            />
          </div>
        </section>

        {/* Accesos rápidos */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Accesos rápidos</h2>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/pedidos/nuevo"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              + Nuevo pedido
            </Link>
            <Link
              href="/pedidos"
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
            >
              Ver todos los pedidos
            </Link>
            <Link
              href="/clientes"
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
            >
              Ver clientes
            </Link>
          </div>
        </section>
      </div>
    )
  }

  // Vista asesor
  const m = await getMetricasAsesor(usuario.id)

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Hola, {usuario.nombre.split(' ')[0]}</h1>
      <p className="text-sm text-gray-500 mb-6">Resumen de tu actividad</p>

      {m.pedidos_en_alerta > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-sm font-semibold text-yellow-800">
            {m.pedidos_en_alerta} {m.pedidos_en_alerta === 1 ? 'pedido requiere' : 'pedidos requieren'} atención
          </p>
          <Link href="/pedidos" className="text-xs text-yellow-700 underline mt-1 inline-block">
            Ver mis pedidos →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <KpiCard label="Pedidos activos"    valor={m.pedidos_activos} />
        <KpiCard
          label="En alerta"
          valor={m.pedidos_en_alerta}
          alerta={m.pedidos_en_alerta > 0}
        />
        <KpiCard label="Ventas del mes"     valor={formatCOP(m.ventas_mes)} />
        <KpiCard label="Ticket promedio"    valor={formatCOP(m.ticket_promedio)} />
      </div>

      <div className="flex gap-3">
        <Link
          href="/pedidos/nuevo"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
        >
          + Nuevo pedido
        </Link>
        <Link
          href="/pedidos"
          className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
        >
          Ver mis pedidos
        </Link>
      </div>
    </div>
  )
}
