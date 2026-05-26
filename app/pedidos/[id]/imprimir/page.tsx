import { notFound } from 'next/navigation'
import { getPedidoDetalle } from '@/lib/queries/pedidos'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ESTADO_LABELS } from '@/types'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { PrintButton } from '@/components/pedidos/PrintButton'

export default async function ImprimirPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sesion = await getSesion()
  const { id } = await params
  const pedido = await getPedidoDetalle(id)

  if (!pedido) notFound()
  if (!puedeAccederSede(sesion, pedido.sede_id)) notFound()

  const saldo = pedido.total - pedido.total_pagado

  return (
    <>
      {/* Botón imprimir — se oculta al imprimir */}
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <PrintButton />
        <a
          href={`/pedidos/${id}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      <div className="max-w-2xl mx-auto p-8 font-sans text-sm text-gray-900">
        {/* Encabezado */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-900">
          <div>
            <h1 className="text-xl font-bold">TR Original</h1>
            <p className="text-gray-500 text-xs mt-0.5">{pedido.sede_nombre}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pedido</p>
            <p className="font-mono font-bold text-base">{pedido.numero_orden}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatFecha(pedido.fecha_creacion)}</p>
          </div>
        </div>

        {/* Cliente */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Cliente</p>
            <p className="font-semibold">{pedido.cliente_nombre}</p>
            <p className="text-gray-500">{formatearTelefono(pedido.cliente_telefono)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Entrega</p>
            <p className="capitalize">{pedido.tipo_entrega}</p>
            {pedido.direccion_entrega && (
              <p className="text-gray-500 text-xs mt-0.5">{pedido.direccion_entrega}</p>
            )}
            <p className="mt-1">
              <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 rounded-full">
                {ESTADO_LABELS[pedido.estado]}
              </span>
            </p>
            {pedido.numero_guia && (
              <p className="text-xs text-gray-500 mt-1.5">Guía: <span className="font-mono text-gray-700">{pedido.numero_guia}</span></p>
            )}
          </div>
        </div>

        {/* Productos */}
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Producto</th>
              <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase w-16">Talla</th>
              <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase w-12">Cant.</th>
              <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase w-24">Precio</th>
            </tr>
          </thead>
          <tbody>
            {pedido.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">
                  <span className="font-medium">{item.marca}</span>
                  <span className="text-gray-500 ml-1">{item.descripcion}</span>
                </td>
                <td className="py-2 text-center text-gray-500">{item.talla ?? '—'}</td>
                <td className="py-2 text-center">{item.cantidad}</td>
                <td className="py-2 text-right">{formatCOP(item.precio_venta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-900">
              <td colSpan={3} className="py-2 font-bold text-right pr-4">Total</td>
              <td className="py-2 font-bold text-right">{formatCOP(pedido.total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Pagos */}
        {pedido.pagos.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Pagos recibidos</p>
            {pedido.pagos.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-gray-500">{formatFecha(p.fecha)} · <span className="capitalize">{p.metodo}</span></span>
                <span className="font-medium">{formatCOP(p.monto)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold">
              <span>Total pagado</span>
              <span className="text-green-700">{formatCOP(pedido.total_pagado)}</span>
            </div>
            {saldo > 0 && (
              <div className="flex justify-between pt-1 font-bold text-red-600">
                <span>Saldo pendiente</span>
                <span>{formatCOP(saldo)}</span>
              </div>
            )}
          </div>
        )}

        {/* Notas */}
        {pedido.notas && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Notas</p>
            <p className="text-gray-700">{pedido.notas}</p>
          </div>
        )}

        {/* Pie */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          Asesor: {pedido.asesor_nombre} · Impreso el {formatFecha(new Date().toISOString())}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </>
  )
}
