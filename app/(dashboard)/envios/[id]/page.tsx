import { redirect, notFound } from 'next/navigation'
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
        <Link href="/envios" className="text-gray-400 hover:text-gray-600 text-sm">← Envíos</Link>
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider w-10">#</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Número / Código</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Detalle</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Talla</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Cant.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {envio.items.map((it, i) => (
              <tr key={it.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-3 text-xs text-gray-300 font-medium">{i + 1}</td>
                <td className="px-4 py-3">
                  {it.pedido_id ? (
                    <Link href={`/pedidos/${it.pedido_id}`} className="font-mono font-bold text-blue-600 hover:underline">
                      {it.numero_orden}
                    </Link>
                  ) : (
                    <span className="font-mono font-bold text-gray-900">{it.codigo}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {it.descripcion ?? '—'}
                  {!it.pedido_id && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Artículo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{it.talla ?? '—'}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800">{it.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
