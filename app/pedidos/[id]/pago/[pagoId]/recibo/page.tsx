import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { formatCOP, formatFecha, formatFechaHora } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
  otro: 'Otro',
}

export default async function ReciboPagoPage({
  params,
}: {
  params: Promise<{ id: string; pagoId: string }>
}) {
  const sesion = await getSesion()
  const supabase = await createClient()
  const { id: pedidoId, pagoId } = await params

  const [pedidoRes, pagoRes] = await Promise.all([
    supabase
      .from('vista_pedidos_asesor')
      .select('numero_orden, cliente_nombre, cliente_telefono, sede_nombre, sede_id, total, total_pagado')
      .eq('id', pedidoId)
      .single(),
    supabase
      .from('pagos')
      .select('id, monto, metodo, fecha, notas, creado_en, usuarios(nombre)')
      .eq('id', pagoId)
      .eq('pedido_id', pedidoId)
      .single(),
  ])

  if (!pedidoRes.data || !pagoRes.data) notFound()
  if (!puedeAccederSede(sesion, pedidoRes.data.sede_id)) notFound()

  const pedido = pedidoRes.data
  const pago   = pagoRes.data
  const asesorNombre = (pago.usuarios as any)?.nombre ?? '—'

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Imprimir
        </button>
        <a
          href={`/pedidos/${pedidoId}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      <div className="max-w-sm mx-auto p-8 font-sans text-sm text-gray-900">
        {/* Encabezado */}
        <div className="text-center mb-6 pb-4 border-b-2 border-gray-900">
          <h1 className="text-lg font-bold">TR Original</h1>
          <p className="text-gray-500 text-xs">{pedido.sede_nombre}</p>
          <p className="text-xl font-bold mt-3">RECIBO DE PAGO</p>
        </div>

        {/* Datos del pago */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-500">Pedido</span>
            <span className="font-mono font-bold">{pedido.numero_orden}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Cliente</span>
            <span className="font-medium text-right max-w-[60%]">{pedido.cliente_nombre}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Teléfono</span>
            <span>{formatearTelefono(pedido.cliente_telefono)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha pago</span>
            <span>{formatFecha(pago.fecha)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Método</span>
            <span className="capitalize">{METODO_LABELS[pago.metodo] ?? pago.metodo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Registrado por</span>
            <span>{asesorNombre}</span>
          </div>
        </div>

        {/* Monto destacado */}
        <div className="border-2 border-gray-900 rounded-lg p-4 text-center mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Valor recibido</p>
          <p className="text-3xl font-bold">{formatCOP(pago.monto)}</p>
        </div>

        {/* Resumen del pedido */}
        <div className="space-y-1.5 mb-6 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Total del pedido</span>
            <span>{formatCOP(pedido.total)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Total pagado</span>
            <span className="text-green-700 font-medium">{formatCOP(pedido.total_pagado)}</span>
          </div>
          {pedido.total - pedido.total_pagado > 0 && (
            <div className="flex justify-between font-semibold text-red-600 pt-1 border-t border-gray-200">
              <span>Saldo pendiente</span>
              <span>{formatCOP(pedido.total - pedido.total_pagado)}</span>
            </div>
          )}
          {pedido.total - pedido.total_pagado === 0 && (
            <p className="text-center text-green-600 font-semibold pt-1 border-t border-gray-200">
              ✓ Pedido totalmente pagado
            </p>
          )}
        </div>

        {pago.notas && (
          <div className="mb-6 text-xs text-gray-500">
            <span className="font-medium">Notas: </span>{pago.notas}
          </div>
        )}

        {/* Pie */}
        <div className="text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
          <p>Impreso: {formatFechaHora(new Date().toISOString())}</p>
          <p className="mt-1">Gracias por su compra</p>
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
