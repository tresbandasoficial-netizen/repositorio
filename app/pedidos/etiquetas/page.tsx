import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { formatearTelefono } from '@/lib/utils/phone'
import { PrintButton } from '@/components/pedidos/PrintButton'

// Etiquetas en lote: una hoja de 100×150 mm por pedido, con número de orden,
// nombre del cliente y teléfono. Se llega desde la lista de pedidos
// seleccionando varios y pulsando "Etiquetas".
export default async function EtiquetasLotePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const sesion = await getSesion()
  const { ids: idsParam } = await searchParams
  const ids = (idsParam ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) notFound()

  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, cliente_nombre, cliente_telefono, sede_id')
    .in('id', ids)

  const pedidos = ((data ?? []) as Array<{
    id: string
    numero_orden: string
    cliente_nombre: string
    cliente_telefono: string
    sede_id: string
  }>)
    .filter(p => puedeAccederSede(sesion, p.sede_id))
    // Mantener el orden en que fueron seleccionados
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))

  if (pedidos.length === 0) notFound()

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <PrintButton />
        <a
          href="/pedidos"
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      {pedidos.map((p) => (
        <div key={p.id} className="etiqueta">
          <p className="numero">{p.numero_orden}</p>
          <p className="nombre">{p.cliente_nombre}</p>
          <p className="telefono">{formatearTelefono(p.cliente_telefono)}</p>
        </div>
      ))}

      <style>{`
        .etiqueta {
          width: 100mm;
          height: 150mm;
          padding: 8mm;
          box-sizing: border-box;
          font-family: Arial, sans-serif;
          color: #000;
          background: #fff;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          page-break-after: always;
          break-after: page;
        }
        .etiqueta .numero {
          font-family: 'Courier New', monospace;
          font-weight: 900;
          font-size: 15mm;
          line-height: 1.05;
          margin: 0;
          word-break: break-all;
        }
        .etiqueta .nombre {
          font-weight: 700;
          font-size: 9mm;
          line-height: 1.15;
          margin: 8mm 0 0 0;
        }
        .etiqueta .telefono {
          font-weight: 600;
          font-size: 8mm;
          line-height: 1.15;
          margin: 6mm 0 0 0;
        }
        @media screen {
          body {
            background: #e5e7eb;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 80px 0 40px;
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
          .etiqueta { border: none; box-shadow: none; border-radius: 0; }
          @page {
            size: 100mm 150mm;
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
