import { notFound } from 'next/navigation'
import { getPedidoDetalle } from '@/lib/queries/pedidos'
import { formatCOP } from '@/lib/utils/format'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'

export default async function EtiquetaPedidoPage({
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
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Imprimir etiqueta
        </button>
        <a
          href={`/pedidos/${id}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      {/* Etiqueta */}
      <div className="etiqueta">
        {/* Número de orden */}
        <div className="border-b-2 border-black pb-1 mb-2">
          <p className="text-[9px] uppercase tracking-widest text-gray-500 leading-none">TR Original</p>
          <p className="font-mono font-black text-xl leading-tight">{pedido.numero_orden}</p>
        </div>

        {/* Cliente */}
        <p className="font-bold text-sm leading-tight">{pedido.cliente_nombre}</p>

        {/* Artículos */}
        <div className="mt-2 space-y-0.5">
          {pedido.items.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-2">
              <span className="text-xs leading-tight">
                <span className="font-semibold">{item.marca}</span>
                {' '}{item.descripcion}
                {item.talla && (
                  <span className="font-bold"> T.{item.talla}</span>
                )}
                {item.cantidad > 1 && (
                  <span className="text-gray-500"> x{item.cantidad}</span>
                )}
              </span>
              <span className="text-xs font-medium whitespace-nowrap">{formatCOP(item.precio_venta)}</span>
            </div>
          ))}
        </div>

        {/* Totales */}
        <div className="border-t border-black mt-2 pt-1.5 space-y-0.5">
          <div className="flex justify-between text-xs">
            <span>Total</span>
            <span className="font-semibold">{formatCOP(pedido.total)}</span>
          </div>
          {pedido.total_pagado > 0 && (
            <div className="flex justify-between text-xs">
              <span>Abono</span>
              <span className="font-semibold text-green-700">{formatCOP(pedido.total_pagado)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-black border-t border-black pt-1 mt-1">
            <span>{saldo > 0 ? 'Saldo' : 'PAGADO'}</span>
            <span className={saldo > 0 ? 'text-black' : 'text-green-700'}>
              {saldo > 0 ? formatCOP(saldo) : '✓'}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .etiqueta {
          width: 80mm;
          padding: 6mm;
          font-family: Arial, sans-serif;
          color: #000;
          background: #fff;
        }
        @media screen {
          body {
            background: #e5e7eb;
            display: flex;
            justify-content: center;
            padding-top: 80px;
          }
          .etiqueta {
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border: 1px solid #d1d5db;
            border-radius: 4px;
          }
        }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
