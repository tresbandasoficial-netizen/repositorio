import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidos } from '@/lib/queries/pedidos'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { EstadoPedido, ESTADO_LABELS } from '@/types'

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
}

function getMotivoAlerta(p: {
  estado: EstadoPedido
  fecha_actualizacion: string
  fecha_creacion: string
}): string {
  const diasEstado    = diasDesde(p.fecha_actualizacion)
  const diasCreacion  = diasDesde(p.fecha_creacion)

  if (
    ['pendiente', 'comprado', 'usa'].includes(p.estado) &&
    diasCreacion >= 15
  ) {
    return `${diasCreacion} días sin llegar a Bucaramanga`
  }

  const umbrales: Partial<Record<EstadoPedido, number>> = {
    pendiente:   2,
    comprado:    8,
    usa:         6,
    bucaramanga: 1,
    santa_rosa:  1,
  }

  const umbral = umbrales[p.estado]
  if (umbral && diasEstado >= umbral) {
    return `${diasEstado} días en ${ESTADO_LABELS[p.estado].toLowerCase()}`
  }

  return 'Requiere atención'
}

function urgencia(p: { estado: EstadoPedido; fecha_actualizacion: string; fecha_creacion: string }): number {
  const diasEstado   = diasDesde(p.fecha_actualizacion)
  const diasCreacion = diasDesde(p.fecha_creacion)
  return Math.max(diasEstado, diasCreacion)
}

export default async function AlertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, sedes(codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  const sedeCodigo = usuario.rol === 'visor' ? (usuario.sedes as any)?.codigo : undefined
  const { pedidos } = await getPedidos({ alerta: true, pagina: 1, ...(sedeCodigo ? { sede: sedeCodigo } : {}) })

  const ordenados = [...pedidos].sort(
    (a, b) => urgencia(b) - urgencia(a)
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {pedidos.length === 0
            ? 'Todos los pedidos están al día.'
            : `${pedidos.length} ${pedidos.length === 1 ? 'pedido requiere' : 'pedidos requieren'} atención`}
        </p>
      </div>

      {pedidos.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p className="text-green-700 font-medium">Sin alertas activas</p>
          <p className="text-green-600 text-sm mt-1">Todos los pedidos están dentro de los tiempos.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Móvil */}
          <div className="md:hidden divide-y divide-gray-100">
            {ordenados.map((p) => {
              const motivo = getMotivoAlerta(p)
              return (
                <Link key={p.id} href={`/pedidos/${p.id}`} className="block px-4 py-3 hover:bg-red-50/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-gray-900">{p.numero_orden}</span>
                      <EstadoBadge estado={p.estado as EstadoPedido} enAlerta={true} />
                    </div>
                    <span className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 shrink-0">Ver</span>
                  </div>
                  <p className="text-sm text-gray-700">{p.cliente_nombre}</p>
                  <p className="text-xs text-red-600 font-medium mt-0.5">{motivo}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.asesor_nombre}</p>
                </Link>
              )
            })}
          </div>
          {/* Desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Pedido</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Alerta</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asesor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ordenados.map((p) => {
                const motivo = getMotivoAlerta(p)
                return (
                  <tr key={p.id} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold text-gray-900">{p.numero_orden}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.cliente_nombre}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado as EstadoPedido} enAlerta={true} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-red-600 font-medium text-xs">{motivo}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.asesor_nombre}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/pedidos/${p.id}`}
                        className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 space-y-1">
        <p><span className="font-medium text-gray-500">Umbrales:</span></p>
        <p>· Pendiente: más de 2 días sin cambio</p>
        <p>· Comprado: más de 8 días sin cambio</p>
        <p>· Cualquier pedido activo: más de 15 días sin llegar a Colombia</p>
        <p>· En USA: más de 6 días · Bucaramanga o Santa Rosa: más de 1 día</p>
      </div>
    </div>
  )
}
