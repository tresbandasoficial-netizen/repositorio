import { redirect } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EnvioBuilder } from '@/components/envios/EnvioBuilder'

export default async function NuevoEnvioPage({
  searchParams,
}: {
  searchParams: Promise<{ pedidos?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase.from('usuarios').select('rol, sede_id').eq('id', user.id).single()
  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const { data: sedesRaw } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
  const sedes = (sedesRaw ?? []) as { id: string; codigo: string; nombre: string }[]

  // Pedidos pre-marcados desde la galería (?pedidos=TR6835,TR6900-1,…)
  const sp = await searchParams
  const pedidosIniciales = (sp.pedidos ?? '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 100)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BotonVolver href="/envios">Envíos</BotonVolver>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Nuevo envío</h1>
      </div>

      <EnvioBuilder sedes={sedes} sedeOrigenId={usuario.sede_id ?? null} pedidosIniciales={pedidosIniciales} />
    </div>
  )
}
