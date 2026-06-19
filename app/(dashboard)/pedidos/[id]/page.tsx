import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPedidoDetalle } from '@/lib/queries/pedidos'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { formatCOP, formatFecha, formatFechaHora } from '@/lib/utils/format'
import { formatearTelefono, whatsappUrl } from '@/lib/utils/phone'
import { ESTADO_LABELS } from '@/types'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { CopiarResumen } from '@/components/pedidos/CopiarResumen'
import { EliminarPedidoButton } from '@/components/pedidos/EliminarPedidoButton'
import { SeguimientoBar } from '@/components/pedidos/SeguimientoBar'

const CAMPO_LABELS: Record<string, string> = {
  estado:            'Estado',
  notas:             'Notas',
  tipo_entrega:      'Entrega',
  direccion_entrega: 'Dirección',
  numero_orden:      'Número de pedido',
  total:             'Total',
}

export default async function PedidoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sesion = await getSesion()

  const { id } = await params
  const pedido = await getPedidoDetalle(id)
  if (!pedido) notFound()

  if (!puedeAccederSede(sesion, pedido.sede_id)) notFound()

  const esAdmin = sesion.rol === 'admin'
  const saldo = pedido.total - pedido.total_pagado

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="mb-4 md:mb-6 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/pedidos" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← Pedidos
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-mono font-bold text-gray-900">{pedido.numero_orden}</span>
          <EstadoBadge estado={pedido.estado} enAlerta={pedido.en_alerta} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/pedidos/${id}/pago`}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-semibold transition-colors shadow-sm shadow-blue-200"
          >
            + Registrar pago
          </Link>
          <Link
            href={`/pedidos/${id}/editar`}
            className="text-sm bg-white border border-gray-200 hover:bg-gray-50 px-3.5 py-2 rounded-xl font-medium text-gray-700 transition-colors"
          >
            Editar
          </Link>
          <Link
            href={`/pedidos/${id}/etiqueta`}
            target="_blank"
            className="text-sm bg-white border border-gray-200 hover:bg-gray-50 px-3.5 py-2 rounded-xl font-medium text-gray-500 transition-colors"
          >
            Etiqueta
          </Link>
          <Link
            href={`/pedidos/${id}/imprimir`}
            target="_blank"
            className="hidden sm:inline-flex text-sm bg-white border border-gray-200 hover:bg-gray-50 px-3.5 py-2 rounded-xl font-medium text-gray-500 transition-colors"
          >
            Imprimir
          </Link>
          {esAdmin && <EliminarPedidoButton pedidoId={id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Columna principal */}
        <div className="md:col-span-2 space-y-4">
          {/* Productos */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Productos</h2>
            </CardHeader>
            <CardContent className="p-0">
              {/* Móvil */}
              <div className="md:hidden divide-y divide-gray-50">
                {pedido.items.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    {item.imagen_url && (
                      <img src={item.imagen_url} alt="Producto" className="w-12 h-12 object-cover rounded-lg border border-gray-200 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900">{item.marca}</span>
                      <span className="text-gray-500 ml-1 text-sm">{item.descripcion}</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {item.talla && <span>Talla {item.talla} · </span>}
                        <span>×{item.cantidad}</span>
                      </div>
                    </div>
                    <span className="font-medium text-gray-900 shrink-0">{formatCOP(item.precio_venta)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 flex justify-between bg-gray-50">
                  <span className="font-semibold text-gray-700 text-sm">Total</span>
                  <span className="font-bold text-gray-900">{formatCOP(pedido.total)}</span>
                </div>
              </div>
              {/* Desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Marca / Producto</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Talla</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cant.</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pedido.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {item.imagen_url && (
                            <img src={item.imagen_url} alt="Producto" className="w-10 h-10 object-cover rounded-lg border border-gray-200 flex-shrink-0" />
                          )}
                          <div>
                            <span className="font-medium text-gray-900">{item.marca}</span>
                            <span className="text-gray-500 ml-2">{item.descripcion}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.talla ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.cantidad}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCOP(item.precio_venta)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-700 text-right">Total</td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCOP(pedido.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Pagos */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Pagos</h2>
                <span className={saldo > 0 ? 'text-sm font-medium text-red-600' : 'text-sm font-medium text-green-600'}>
                  {saldo > 0 ? `Saldo pendiente: ${formatCOP(saldo)}` : 'Totalmente pagado'}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {pedido.pagos.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400">Sin pagos registrados.</p>
              ) : (
                <>
                  {/* Móvil */}
                  <div className="md:hidden divide-y divide-gray-50">
                    {pedido.pagos.map((pago) => (
                      <div key={pago.id} className="px-4 py-3 flex justify-between items-start gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{pago.metodo}</p>
                          <p className="text-xs text-gray-400">{formatFecha(pago.fecha)} · {pago.asesor_nombre}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-gray-900">{formatCOP(pago.monto)}</p>
                          <Link href={`/pedidos/${id}/pago/${pago.id}/recibo`} target="_blank" className="text-xs text-gray-400">
                            recibo
                          </Link>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex justify-between bg-gray-50">
                      <span className="font-semibold text-gray-700 text-sm">Total pagado</span>
                      <span className="font-bold text-green-700">{formatCOP(pedido.total_pagado)}</span>
                    </div>
                  </div>
                  {/* Desktop */}
                  <table className="hidden md:table w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Método</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Registrado por</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pedido.pagos.map((pago) => (
                        <tr key={pago.id}>
                          <td className="px-6 py-3 text-gray-600">{formatFecha(pago.fecha)}</td>
                          <td className="px-4 py-3 text-gray-600 capitalize">{pago.metodo}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{pago.asesor_nombre}</td>
                          <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCOP(pago.monto)}</td>
                          <td className="px-3 py-3 text-right">
                            <Link href={`/pedidos/${id}/pago/${pago.id}/recibo`} target="_blank" className="text-xs text-gray-400 hover:text-gray-600" title="Imprimir recibo">🖨</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-gray-700 text-right">Total pagado</td>
                        <td className="px-3 py-3 text-right font-bold text-green-700">{formatCOP(pedido.total_pagado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </CardContent>
          </Card>

          {/* Historial */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Historial</h2>
            </CardHeader>
            <CardContent className="p-0">
              {pedido.historial.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400">Sin cambios registrados.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {pedido.historial.map((h) => {
                    const campoLabel = CAMPO_LABELS[h.campo] ?? h.campo
                    const anteriorLabel = h.valor_anterior
                      ? (ESTADO_LABELS[h.valor_anterior as keyof typeof ESTADO_LABELS] ?? h.valor_anterior)
                      : null
                    const nuevoLabel = h.valor_nuevo
                      ? (ESTADO_LABELS[h.valor_nuevo as keyof typeof ESTADO_LABELS] ?? h.valor_nuevo)
                      : null
                    return (
                      <li key={h.id} className="px-4 py-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">{h.usuario_nombre}</span>
                            <span className="text-gray-500"> cambió </span>
                            <span className="font-medium text-gray-700">{campoLabel}</span>
                            {anteriorLabel && (
                              <>
                                <span className="text-gray-400"> de </span>
                                <span className="text-red-500 font-medium">{anteriorLabel}</span>
                              </>
                            )}
                            {nuevoLabel && (
                              <>
                                <span className="text-gray-400"> a </span>
                                <span className="text-green-600 font-medium">{nuevoLabel}</span>
                              </>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{formatFechaHora(h.fecha)}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Seguimiento */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Seguimiento</h2>
            </CardHeader>
            <CardContent>
              <SeguimientoBar
                pedidoId={id}
                estadoActual={pedido.estado}
                rolUsuario={sesion.rol as 'asesor' | 'admin' | 'visor'}
              />
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Cliente</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-medium text-gray-900">{pedido.cliente_nombre}</p>
                <p className="text-sm text-gray-500 mt-0.5">{formatearTelefono(pedido.cliente_telefono)}</p>
              </div>
              <div className="flex gap-2">
                <a
                  href={whatsappUrl(pedido.cliente_telefono)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs px-3 py-2 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 font-medium transition-colors"
                >
                  WhatsApp
                </a>
                <Link
                  href={`/clientes/${pedido.cliente_id}`}
                  className="flex-1 text-center text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  Ver cliente
                </Link>
              </div>
              <CopiarResumen pedido={pedido} />
            </CardContent>
          </Card>

          {/* Info del pedido */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Detalles</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sede</span>
                <span className="font-medium text-gray-900">{pedido.sede_nombre} ({pedido.sede_codigo})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Asesor</span>
                <span className="font-medium text-gray-900">{pedido.asesor_nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Entrega</span>
                <span className="font-medium text-gray-900 capitalize">{pedido.tipo_entrega}</span>
              </div>
              {pedido.direccion_entrega && (
                <div>
                  <span className="text-gray-500 block">Dirección</span>
                  <span className="text-gray-700 text-xs">{pedido.direccion_entrega}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Creado</span>
                <span className="text-gray-700">{formatFecha(pedido.fecha_creacion)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Actualizado</span>
                <span className="text-gray-700">{formatFecha(pedido.fecha_actualizacion)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Notas */}
          {pedido.notas && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">Notas</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{pedido.notas}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
