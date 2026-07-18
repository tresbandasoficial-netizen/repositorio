import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { AvisoTareas } from '@/components/tareas/AvisoTareas'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  // Tareas pendientes asignadas a quien está conectado: se muestran como un
  // aviso flotante abajo de la pantalla en todas las páginas.
  const { data: tareasPendientes } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion')
    .eq('asignado_a', usuario.id)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true })

  return (
    <DashboardShell usuario={usuario}>
      {children}
      <AvisoTareas tareas={tareasPendientes ?? []} />
    </DashboardShell>
  )
}
