import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { AsistenciaClientPage, type MarcaAsistencia } from '@/components/asistencia/AsistenciaClientPage'

export default async function AsistenciaPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/pedidos')

  const supabase = await createClient()
  // Últimos 30 días. El RLS ya limita al asesor a sus propias marcas.
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('asistencia')
    .select('id, usuario_id, llegada, salida, usuario:usuarios(nombre), sede:sedes(codigo)')
    .gte('llegada', desde)
    .order('llegada', { ascending: false })

  const marcas: MarcaAsistencia[] = ((data ?? []) as any[]).map(m => ({
    id: m.id,
    usuario_id: m.usuario_id,
    llegada: m.llegada,
    salida: m.salida,
    usuario_nombre: (Array.isArray(m.usuario) ? m.usuario[0] : m.usuario)?.nombre ?? '—',
    sede_codigo: (Array.isArray(m.sede) ? m.sede[0] : m.sede)?.codigo ?? null,
  }))

  const turnoAbierto = marcas.some(m => m.usuario_id === sesion.id && !m.salida)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AsistenciaClientPage
        marcas={marcas}
        esAdmin={sesion.rol === 'admin'}
        turnoAbierto={turnoAbierto}
      />
    </div>
  )
}
