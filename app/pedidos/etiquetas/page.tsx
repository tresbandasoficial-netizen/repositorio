import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion, puedeAccederSede } from '@/lib/auth/acceso'
import { formatearTelefonoLocal } from '@/lib/utils/phone'
import { PrintButton } from '@/components/pedidos/PrintButton'

type PedidoEtiqueta = {
  id: string
  numero_orden: string
  cliente_nombre: string
  cliente_telefono: string
  sede_id: string
}

// Etiquetas en lote: hojas de 100×150 mm con una cuadrícula de 2×3 (6 etiquetas
// por hoja), cada etiqueta con número de orden, nombre y teléfono (sin +57).
// Se llega desde la lista de pedidos seleccionando varios y pulsando "Etiquetas".
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

  const pedidos = ((data ?? []) as PedidoEtiqueta[])
    .filter(p => puedeAccederSede(sesion, p.sede_id))
    // Mantener el orden en que fueron seleccionados
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))

  if (pedidos.length === 0) notFound()

  // Agrupar en hojas de 6 (2 columnas × 3 filas)
  const hojas: PedidoEtiqueta[][] = []
  for (let i = 0; i < pedidos.length; i += 6) {
    hojas.push(pedidos.slice(i, i + 6))
  }

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

      {hojas.map((hoja, h) => (
        <div key={h} className="hoja">
          {hoja.map((p) => (
            <div key={p.id} className="celda">
              <p className="numero">{p.numero_orden}</p>
              <p className="nombre">{p.cliente_nombre}</p>
              <p className="telefono">{formatearTelefonoLocal(p.cliente_telefono)}</p>
            </div>
          ))}
          {/* Completar la cuadrícula con celdas vacías para conservar los bordes */}
          {Array.from({ length: 6 - hoja.length }).map((_, i) => (
            <div key={`v-${i}`} className="celda" />
          ))}
        </div>
      ))}

      <style>{`
        .hoja {
          width: 100mm;
          height: 150mm;
          box-sizing: border-box;
          background: #fff;
          display: grid;
          grid-template-columns: 50mm 50mm;
          grid-template-rows: 50mm 50mm 50mm;
          page-break-after: always;
          break-after: page;
        }
        .celda {
          box-sizing: border-box;
          border: 0.4mm solid #000;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 2mm;
          overflow: hidden;
          font-family: Arial, sans-serif;
          color: #000;
        }
        .celda .numero {
          font-family: 'Courier New', monospace;
          font-weight: 900;
          font-size: 7mm;
          line-height: 1.05;
          margin: 0;
          word-break: break-all;
        }
        .celda .nombre {
          font-weight: 700;
          font-size: 4.2mm;
          line-height: 1.15;
          margin: 2.5mm 0 0 0;
        }
        .celda .telefono {
          font-weight: 600;
          font-size: 4mm;
          line-height: 1.15;
          margin: 1.5mm 0 0 0;
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
          .hoja {
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border-radius: 4px;
          }
        }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          .hoja { box-shadow: none; border-radius: 0; }
          @page {
            size: 100mm 150mm;
            margin: 0;
          }
        }
      `}</style>
    </>
  )
}
