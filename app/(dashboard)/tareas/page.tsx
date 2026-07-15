import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { getTareas } from '@/lib/queries/tareas'
import { TareasClientPage } from '@/components/tareas/TareasClientPage'

export default async function TareasPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/pedidos')

  const supabase = await createClient()
  const [tareas, usuariosRes] = await Promise.all([
    getTareas(),
    sesion.rol === 'admin'
      ? supabase.from('usuarios').select('id, nombre, sede:sedes(codigo)').eq('activo', true).order('nombre')
      : Promise.resolve({ data: [] } as any),
  ])

  const asesores = ((usuariosRes.data ?? []) as any[]).map(u => ({
    id: u.id,
    nombre: u.nombre,
    sede_codigo: (Array.isArray(u.sede) ? u.sede[0] : u.sede)?.codigo ?? null,
  }))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <TareasClientPage tareas={tareas} asesores={asesores} esAdmin={sesion.rol === 'admin'} />
    </div>
  )
}
