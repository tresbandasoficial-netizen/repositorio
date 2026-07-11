import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEnvioDetalle } from '@/lib/queries/envios'
import { formatFechaHora } from '@/lib/utils/format'
import { PrintButton } from '@/components/pedidos/PrintButton'

// Documento de remisión del envío: lista imprimible de todo lo que va en la
// caja (pedidos y artículos sueltos), con espacio de firmas para control.
export default async function ImprimirEnvioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const envio = await getEnvioDetalle(id)
  if (!envio) notFound()

  const pedidos = envio.items.filter(it => it.pedido_id)
  const articulos = envio.items.filter(it => !it.pedido_id)
  const totalUnidades = envio.items.reduce((s, it) => s + it.cantidad, 0)

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <PrintButton />
        <a
          href={`/envios/${envio.id}`}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Volver
        </a>
      </div>

      <div className="documento">
        {/* Encabezado */}
        <div className="cabecera">
          <div>
            <h1>TRES BANDAS</h1>
            <p className="sub">Remisión de envío entre sedes</p>
          </div>
          <div className="numero-envio">
            <p className="lbl">ENVÍO</p>
            <p className="num">#{envio.consecutivo}</p>
          </div>
        </div>

        <div className="datos">
          <p><strong>Fecha:</strong> {formatFechaHora(envio.creado_en)}</p>
          <p><strong>Destino:</strong> {envio.destino_nombre} ({envio.destino_codigo})</p>
          {envio.origen_nombre && <p><strong>Origen:</strong> {envio.origen_nombre}</p>}
          {envio.creado_por_nombre && <p><strong>Elaborado por:</strong> {envio.creado_por_nombre}</p>}
          {envio.notas && <p><strong>Notas:</strong> {envio.notas}</p>}
          <p><strong>Contenido:</strong> {pedidos.length} pedidos · {articulos.length} artículos · {totalUnidades} unidades</p>
        </div>

        <table>
          <thead>
            <tr>
              <th className="c">#</th>
              <th>Número / Código</th>
              <th>Detalle</th>
              <th className="c">Talla</th>
              <th className="c">Cant.</th>
              <th className="c chk">✓</th>
            </tr>
          </thead>
          <tbody>
            {envio.items.map((it, i) => (
              <tr key={it.id}>
                <td className="c">{i + 1}</td>
                <td className="mono">{it.pedido_id ? it.numero_orden : it.codigo}</td>
                <td>{it.pedido_id ? it.descripcion : `${it.descripcion ?? ''}${!it.pedido_id ? ' (artículo)' : ''}`}</td>
                <td className="c">{it.talla ?? '—'}</td>
                <td className="c">{it.cantidad}</td>
                <td className="c chk"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Firmas */}
        <div className="firmas">
          <div>
            <div className="linea" />
            <p>Envía</p>
          </div>
          <div>
            <div className="linea" />
            <p>Transporta</p>
          </div>
          <div>
            <div className="linea" />
            <p>Recibe</p>
          </div>
        </div>
      </div>

      <style>{`
        .documento {
          width: 190mm;
          padding: 10mm;
          font-family: Arial, sans-serif;
          color: #000;
          background: #fff;
          font-size: 11pt;
        }
        .cabecera { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.6mm solid #000; padding-bottom: 4mm; margin-bottom: 4mm; }
        .cabecera h1 { font-size: 16pt; font-weight: 900; margin: 0; }
        .cabecera .sub { margin: 1mm 0 0 0; font-size: 10pt; color: #333; }
        .numero-envio { text-align: right; }
        .numero-envio .lbl { margin: 0; font-size: 9pt; letter-spacing: 1px; color: #555; }
        .numero-envio .num { margin: 0; font-size: 18pt; font-weight: 900; font-family: 'Courier New', monospace; }
        .datos p { margin: 0 0 1.2mm 0; font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
        th, td { border: 0.3mm solid #000; padding: 1.8mm 2mm; font-size: 10pt; text-align: left; }
        th { background: #eee; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
        .c { text-align: center; }
        .mono { font-family: 'Courier New', monospace; font-weight: 700; }
        .chk { width: 8mm; }
        .firmas { display: flex; gap: 10mm; margin-top: 14mm; }
        .firmas > div { flex: 1; text-align: center; }
        .firmas .linea { border-bottom: 0.35mm solid #000; height: 10mm; }
        .firmas p { margin: 1.5mm 0 0 0; font-size: 9pt; color: #333; }
        @media screen {
          body { background: #e5e7eb; display: flex; justify-content: center; padding: 80px 0 40px; }
          .documento { box-shadow: 0 2px 12px rgba(0,0,0,0.15); border-radius: 4px; }
        }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          .documento { width: auto; padding: 0; box-shadow: none; }
          @page { size: letter; margin: 12mm; }
        }
      `}</style>
    </>
  )
}
