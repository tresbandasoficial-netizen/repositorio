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
    <div className="p-6 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pedidos" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Pedidos
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono font-bold text-gray-900 text-lg">{pedido.numero_orden}</span>
        <EstadoBadge estado={pedido.estado} enAlerta={pedido.en_alerta} />

        <div className="ml-auto flex gap-2 flex-wrap justify-end">
          <Link
            href={`/pedidos/${id}/editar`}
            className="text-sm bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium text-gray-700 transition-colors"
          >
            Editar
          </Link>
          <Link
            href={`/pedidos/${id}/estado`}
            className="text-sm bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium text-gray-700 transition-colors"
          >
            Cambiar estado
          </Link>
          <Link
            href={`/pedidos/${id}/pago`}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            + Registrar pago
          </Link>
          <Link
            href={`/pedidos/${id}/imprimir`}
            target="_blank"
            className="text-sm bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium text-gray-500 transition-colors"
          >
            Imprimir
          </Link>
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
              <table className="w-full text-sm">
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
                        <span className="font-medium text-gray-900">{item.marca}</span>
                        <span className="text-gray-500 ml-2">{item.descripcion}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.talla ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.cantidad}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatCOP(item.precio_venta)}
                      </td>
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
                <p className="px-6 py-4 text-sm text-gray-400">Sin pagos registrados.</p>
              ) : (
                <table className="w-full text-sm">
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
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-700 text-right">Total pagado</td>
                      <td className="px-6 py-3 text-right font-bold text-green-700">{formatCOP(pedido.total_pagado)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Historial */}
          {pedido.historial.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-gray-900">Historial de cambios</h2>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-gray-50">
                  {pedido.historial.map((h) => (
                    <li key={h.id} className="px-6 py-3 text-sm">
                      <span className="text-gray-500">{formatFechaHora(h.fecha)}</span>
                      {' · '}
                      <span className="text-gray-700 font-medium">{h.usuario_nombre}</span>
                      {' cambió '}
                      <span className="font-medium text-gray-900">{h.campo}</span>
                      {h.valor_anterior && (
                        <>
                          {' de '}
                          <span className="text-red-500">{ESTADO_LABELS[h.valor_anterior as keyof typeof ESTADO_LABELS] ?? h.valor_anterior}</span>
                        </>
                      )}
                      {h.valor_nuevo && (
                        <>
                          {' a '}
                          <span className="text-green-600">{ESTADO_LABELS[h.valor_nuevo as keyof typeof ESTADO_LABELS] ?? h.valor_nuevo}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
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
              {pedido.numero_guia && (
                <div>
                  <span className="text-gray-500 block">Guía de envío</span>
                  <span className="font-mono text-xs text-gray-800 break-all">{pedido.numero_guia}</span>
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
