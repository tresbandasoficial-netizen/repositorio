import { redirect, notFound } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEnvioDetalle } from '@/lib/queries/envios'
import { formatFechaHora } from '@/lib/utils/format'
import { MarcarSantaRosaButton } from '@/components/envios/MarcarSantaRosaButton'
import { Printer } from 'lucide-react'

export default async function EnvioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const { id } = await params
  const envio = await getEnvioDetalle(id)
  if (!envio) notFound()

  const pedidos = envio.items.filter(it => it.pedido_id)
  const articulos = envio.items.filter(it => !it.pedido_id)
  const esSantaRosa = envio.destino_codigo === 'SR'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <BotonVolver href="/envios">Envíos</BotonVolver>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Envío #{envio.consecutivo} → {envio.destino_nombre}</h1>
        <div className="ml-auto flex items-center gap-2">
          {esSantaRosa && pedidos.length > 0 && (
            <MarcarSantaRosaButton pedidoIds={pedidos.map(p => p.pedido_id!)} />
          )}
          <Link
            href={`/envios/${envio.id}/imprimir`}
            target="_blank"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Printer size={15} />
            Imprimir documento
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium">Fecha</p>
          <p className="font-semibold text-gray-800">{formatFechaHora(envio.creado_en)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium">Destino</p>
          <p className="font-semibold text-gray-800">{envio.destino_nombre} ({envio.destino_codigo})</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium">Creado por</p>
          <p className="font-semibold text-gray-800">{envio.creado_por_nombre ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium">Contenido</p>
          <p className="font-semibold text-gray-800">{pedidos.length} pedidos · {articulos.length} artículos</p>
        </div>
        {envio.notas && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-gray-400 uppercase font-medium">Notas</p>
            <p className="text-gray-700">{envio.notas}</p>
          </div>
        )}
      </div>

      {/* Cuadrícula estilo Excel: cada pedido se desglosa en una fila por
          artículo (número y cliente combinados con rowSpan cuando el pedido
          lleva varios). */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Talla</th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cant.</th>
            </tr>
          </thead>
          <tbody>
            {envio.items.map((it, i) => {
              const filas = it.productos.length > 0
                ? it.productos
                : [{ imagen_url: null, marca: '—', descripcion: it.pedido_id ? '—' : (it.descripcion ?? '—'), talla: it.talla, cantidad: it.cantidad }]
              return filas.map((pr, j) => (
                <tr key={it.id + '-' + j}>
                  {j === 0 && (
                    <>
                      <td rowSpan={filas.length} className="border border-gray-200 px-3 py-2 text-xs text-gray-400 align-top">{i + 1}</td>
                      <td rowSpan={filas.length} className="border border-gray-200 px-3 py-2 align-top">
                        {it.pedido_id ? (
                          <Link href={`/pedidos/${it.pedido_id}`} className="font-mono font-bold text-blue-600 hover:underline">
                            {it.numero_orden}
                          </Link>
                        ) : (
                          <>
                            <span className="font-mono font-bold text-gray-900">{it.codigo}</span>
                            <span className="block mt-0.5 text-[10px] font-semibold text-violet-700">Artículo suelto</span>
                          </>
                        )}
                      </td>
                      <td rowSpan={filas.length} className="border border-gray-200 px-3 py-2 text-gray-700 align-top">
                        {it.pedido_id ? (it.descripcion ?? '—') : '—'}
                      </td>
                    </>
                  )}
                  <td className="border border-gray-200 px-3 py-2 text-gray-900">{pr.descripcion}</td>
                  <td className="border border-gray-200 px-3 py-2 text-gray-700">{pr.marca ?? '—'}</td>
                  <td className="border border-gray-200 px-3 py-2 text-center font-semibold text-gray-900">{pr.talla ?? '—'}</td>
                  <td className="border border-gray-200 px-3 py-2 text-center text-gray-700">{pr.cantidad}</td>
                </tr>
              ))
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="border border-gray-300 bg-gray-50 px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Total unidades</td>
              <td className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-bold text-gray-900">
                {envio.items.reduce((s, it) => s + (it.productos.length > 0
                  ? it.productos.reduce((x, pr) => x + (pr.cantidad || 1), 0)
                  : (it.cantidad || 1)), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
