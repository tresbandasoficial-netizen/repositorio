import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFacturaDetalle } from '@/lib/queries/facturas'
import { getSesion } from '@/lib/auth/acceso'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { Badge } from '@/components/ui/Badge'
import { ESTADO_FACTURA_LABELS, ESTADO_FACTURA_COLORES } from '@/types'
import { RegistrarPagoFacturaForm } from '@/components/facturacion/RegistrarPagoFacturaForm'
import { AnularFacturaButton } from '@/components/facturacion/AnularFacturaButton'
import { DomicilioDesdeFacturaPanel } from '@/components/domicilios/DomicilioDesdeFacturaPanel'

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [factura, sesion] = await Promise.all([getFacturaDetalle(id), getSesion()])
  if (!factura) notFound()

  const activa = factura.estado === 'pendiente' || factura.estado === 'vencida'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/facturacion" className="text-sm text-gray-500 hover:text-gray-700">← Facturación</Link>

      <div className="flex items-start justify-between mt-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{factura.numero_factura}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {factura.cliente_nombre} · {factura.cliente_telefono}
          </p>
        </div>
        <Badge className={ESTADO_FACTURA_COLORES[factura.estado]}>{ESTADO_FACTURA_LABELS[factura.estado]}</Badge>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link href={`/facturacion/${factura.id}/recibo`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800">
          🧾 Generar imagen para el cliente
        </Link>
        <DomicilioDesdeFacturaPanel
          clienteNombre={factura.cliente_nombre}
          clienteTelefono={factura.cliente_telefono}
          numeroFactura={factura.numero_factura}
          numerosOrden={factura.pedidos.map(p => p.numero_orden).filter((n): n is string => n !== null)}
        />
      </div>

      {/* Datos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Total</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(factura.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Abonado</p>
          <p className="text-base font-bold text-green-600 mt-1">{formatCOP(factura.total_abonado)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Saldo</p>
          <p className={`text-base font-bold mt-1 ${factura.saldo > 0 ? 'text-gray-900' : 'text-green-600'}`}>
            {formatCOP(factura.saldo)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Vence</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatFecha(factura.fecha_vencimiento)}</p>
          {factura.dias_atraso > 0 && <p className="text-xs text-red-500">{factura.dias_atraso} días atraso</p>}
        </div>
      </div>

      {/* Pedidos incluidos */}
      <div className="bg-white rounded-xl border border-gray-100 mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">
            {factura.pedidos.every(p => !p.numero_orden) ? 'Productos vendidos' : `Pedidos incluidos (${factura.pedidos.length})`}
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {factura.pedidos.map(p => (
            <div key={p.id} className="px-5 py-4">
              {/* Encabezado del pedido (solo si tiene número de orden) */}
              {p.numero_orden && (
                <div className="flex items-center justify-between mb-2">
                  <Link href={`/pedidos/${p.id}`} className="font-mono text-sm text-blue-600 hover:underline">
                    {p.numero_orden}
                  </Link>
                  <span className="text-sm font-medium text-gray-700">{formatCOP(p.total)}</span>
                </div>
              )}
              {/* Productos del pedido */}
              {p.items.length > 0 && (
                <div className="space-y-1">
                  {p.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="text-gray-700">
                        <span className="font-medium">{item.marca} {item.descripcion}</span>
                        {item.talla && <span className="text-gray-400 ml-1">· T{item.talla}</span>}
                        {item.cantidad > 1 && <span className="text-gray-400 ml-1">× {item.cantidad}</span>}
                      </div>
                      <span className="text-gray-600 ml-4 flex-none">{formatCOP(item.precio_venta * item.cantidad)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Total si no tiene número de orden */}
              {!p.numero_orden && (
                <div className="flex justify-end mt-2 pt-2 border-t border-gray-50">
                  <span className="text-sm font-semibold text-gray-900">{formatCOP(p.total)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Abonos */}
      <div className="bg-white rounded-xl border border-gray-100 mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Abonos ({factura.abonos.length})</p>
        </div>
        {factura.abonos.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-400">Sin abonos registrados</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {factura.abonos.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{formatCOP(a.monto)}</p>
                  <p className="text-xs text-gray-400">
                    {formatFecha(a.fecha)} · {a.metodo} · {a.asesor_nombre}
                  </p>
                </div>
                {a.notas && <p className="text-xs text-gray-400 max-w-xs truncate">{a.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registrar abono */}
      {activa && factura.saldo > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mb-6 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Registrar abono</p>
          <RegistrarPagoFacturaForm facturaId={factura.id} saldo={factura.saldo} />
        </div>
      )}

      {/* Anular (solo admin) */}
      {sesion.rol === 'admin' && factura.estado !== 'anulada' && (
        <div className="flex justify-end">
          <AnularFacturaButton facturaId={factura.id} />
        </div>
      )}
    </div>
  )
}
