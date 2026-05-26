import { notFound } from 'next/navigation'
import { getPedidoDetalle } from '@/lib/queries/pedidos'
import { formatCOP } from '@/lib/utils/format'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { PrintButton } from '@/components/pedidos/PrintButton'

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
        <PrintButton />
        <a
          href={`/pedidos/${id}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      {/* Etiqueta */}
      <div className="etiqueta">
        <p className="font-mono font-black text-2xl leading-tight">{pedido.numero_orden}</p>
        <p className="font-bold text-base mt-1 leading-tight">{pedido.cliente_nombre}</p>
        <div className="border-t border-black mt-3 pt-2 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Total</span>
            <span className="font-semibold">{formatCOP(pedido.total)}</span>
          </div>
          <div className="flex justify-between text-base font-black">
            <span>{saldo > 0 ? 'Saldo' : 'PAGADO'}</span>
            <span>{saldo > 0 ? formatCOP(saldo) : '✓'}</span>
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
