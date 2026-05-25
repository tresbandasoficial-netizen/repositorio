import Link from 'next/link'
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
    ['pendiente', 'comprado', 'llego_usa'].includes(p.estado) &&
    diasCreacion >= 15
  ) {
    return `${diasCreacion} días sin llegar a bodega Colombia`
  }

  const umbrales: Partial<Record<EstadoPedido, number>> = {
    pendiente:       2,
    comprado:        8,
    llego_usa:       15,
    bodega_colombia: 5,
    avisado:         3,
    en_sede:         2,
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
  const { pedidos } = await getPedidos({ alerta: true, pagina: 1 })

  const ordenados = [...pedidos].sort(
    (a, b) => urgencia(b) - urgencia(a)
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
          <table className="w-full text-sm">
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
                const dias   = Math.max(diasDesde(p.fecha_actualizacion), diasDesde(p.fecha_creacion))
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
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Ver →
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
        <p>· Cualquier pedido: más de 15 días sin llegar a bodega Colombia</p>
        <p>· Llegó a USA: más de 15 días · Bodega Colombia: más de 5 días · Avisado: más de 3 días · En sede: más de 2 días</p>
      </div>
    </div>
  )
}
