import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEnvios } from '@/lib/queries/envios'
import { formatFechaHora } from '@/lib/utils/format'
import { Plus, Send, ChevronRight } from 'lucide-react'

export default async function EnviosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const envios = await getEnvios()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Envíos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Remisiones de mercancía entre sedes</p>
        </div>
        <Link
          href="/envios/nuevo"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-2xl transition-colors shadow-md shadow-blue-200"
        >
          <Plus size={15} />
          Nuevo envío
        </Link>
      </div>

      {envios.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Send size={20} className="text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm font-medium">Aún no hay envíos</p>
          <p className="text-gray-400 text-xs mt-1">Crea el primero con los pedidos que van para otra sede</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
          {envios.map(e => (
            <Link key={e.id} href={`/envios/${e.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                <Send size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  Envío #{e.consecutivo} → {e.destino_nombre} <span className="text-gray-300">({e.destino_codigo})</span>
                </p>
                <p className="text-xs text-gray-400">
                  {formatFechaHora(e.creado_en)}{e.creado_por_nombre ? ` · ${e.creado_por_nombre}` : ''}
                </p>
              </div>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 shrink-0">
                {e.total_items} ítem{e.total_items !== 1 ? 's' : ''}
              </span>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
