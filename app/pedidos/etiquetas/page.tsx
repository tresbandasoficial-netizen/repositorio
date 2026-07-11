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
  cliente_id: string
  sede_id: string
  ciudad?: string | null
}

// Etiquetas en lote: hojas de 100×150 mm con una cuadrícula de 2×4 (8 etiquetas
// por hoja). Cada etiqueta es un recuadro con número de orden, nombre, teléfono
// (sin +57) y la ciudad del cliente si la tiene registrada.
// Acepta ?ids=uuid,uuid (selección con checkbox) o ?nums=TR123,TR456 (números
// de orden escritos a mano).
export default async function EtiquetasLotePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; nums?: string }>
}) {
  const sesion = await getSesion()
  const { ids: idsParam, nums: numsParam } = await searchParams
  const ids = (idsParam ?? '').split(',').map(s => s.trim()).filter(Boolean)
  // Números de orden: separados por coma, espacio o salto de línea; siempre en mayúsculas.
  const nums = (numsParam ?? '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  if (ids.length === 0 && nums.length === 0) notFound()

  const supabase = await createClient()
  let query = supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, cliente_nombre, cliente_telefono, cliente_id, sede_id')
  query = ids.length > 0 ? query.in('id', ids) : query.in('numero_orden', nums)
  const { data } = await query

  const orden = (p: PedidoEtiqueta) =>
    ids.length > 0 ? ids.indexOf(p.id) : nums.indexOf(p.numero_orden)
  const pedidos = ((data ?? []) as PedidoEtiqueta[])
    .filter(p => puedeAccederSede(sesion, p.sede_id))
    // Mantener el orden en que fueron pedidos (selección o texto digitado)
    .sort((a, b) => orden(a) - orden(b))

  // Números digitados que no se encontraron (para avisar en pantalla, no se imprime)
  const encontrados = new Set(pedidos.map(p => p.numero_orden))
  const noEncontrados = nums.filter(n => !encontrados.has(n))

  if (pedidos.length === 0) notFound()

  // Ciudad de cada cliente (campo opcional de la ficha del cliente)
  const clienteIds = Array.from(new Set(pedidos.map(p => p.cliente_id)))
  const { data: clientesData } = await supabase
    .from('clientes')
    .select('id, ciudad')
    .in('id', clienteIds)
  const ciudadPorCliente = new Map(
    ((clientesData ?? []) as Array<{ id: string; ciudad: string | null }>).map(c => [c.id, c.ciudad])
  )
  for (const p of pedidos) p.ciudad = ciudadPorCliente.get(p.cliente_id) ?? null

  // Agrupar en hojas de 8 (2 columnas × 4 filas)
  const POR_HOJA = 8
  const hojas: PedidoEtiqueta[][] = []
  for (let i = 0; i < pedidos.length; i += POR_HOJA) {
    hojas.push(pedidos.slice(i, i + POR_HOJA))
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

      {noEncontrados.length > 0 && (
        <div className="no-print fixed top-4 left-4 z-10 max-w-sm bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800 shadow">
          <p className="font-bold mb-0.5">No se encontraron estos números:</p>
          <p className="font-mono">{noEncontrados.join(', ')}</p>
          <p className="text-xs mt-1 text-amber-600">Revisa que estén bien escritos. Las demás etiquetas sí se imprimirán.</p>
        </div>
      )}

      {hojas.map((hoja, h) => (
        <div key={h} className="hoja">
          {hoja.map((p) => (
            <div key={p.id} className="celda">
              <div className="recuadro numero-box">
                <p className="numero">{p.numero_orden}</p>
              </div>
              <div className="recuadro datos-box">
                <p className="nombre">{p.cliente_nombre}</p>
                <p className="telefono">{formatearTelefonoLocal(p.cliente_telefono)}</p>
                {p.ciudad && <p className="ciudad">{p.ciudad}</p>}
              </div>
            </div>
          ))}
          {/* Completar la cuadrícula con celdas vacías para conservar el corte */}
          {Array.from({ length: POR_HOJA - hoja.length }).map((_, i) => (
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
          grid-template-rows: repeat(4, 37.5mm);
          page-break-after: always;
          break-after: page;
        }
        .celda {
          box-sizing: border-box;
          border: 0.35mm solid #000;
          display: flex;
          flex-direction: column;
          padding: 1.5mm;
          gap: 1mm;
          overflow: hidden;
          font-family: Arial, sans-serif;
          color: #000;
        }
        .recuadro {
          box-sizing: border-box;
          border: 0.3mm solid #000;
          border-radius: 1mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 1mm;
          overflow: hidden;
        }
        .numero-box { flex: 0 0 11mm; }
        .datos-box  { flex: 1; }
        .celda .numero {
          font-family: 'Courier New', monospace;
          font-weight: 900;
          font-size: 6.5mm;
          line-height: 1;
          margin: 0;
          word-break: break-all;
        }
        .celda .nombre {
          font-weight: 700;
          font-size: 3.6mm;
          line-height: 1.15;
          margin: 0;
        }
        .celda .telefono {
          font-weight: 600;
          font-size: 3.4mm;
          line-height: 1.15;
          margin: 1mm 0 0 0;
        }
        .celda .ciudad {
          font-weight: 700;
          font-size: 3.4mm;
          line-height: 1.15;
          margin: 1mm 0 0 0;
          text-transform: uppercase;
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
