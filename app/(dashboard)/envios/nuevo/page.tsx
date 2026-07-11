import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EnvioBuilder } from '@/components/envios/EnvioBuilder'

export default async function NuevoEnvioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('rol, sede_id').eq('id', user.id).single()
  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as { id: string; codigo: string; nombre: string }[]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/envios" className="text-gray-400 hover:text-gray-600 text-sm">← Envíos</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Nuevo envío</h1>
      </div>

      <EnvioBuilder sedes={sedes} sedeOrigenId={usuario.sede_id ?? null} />
    </div>
  )
}
