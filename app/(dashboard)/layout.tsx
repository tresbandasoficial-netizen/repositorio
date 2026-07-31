import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { AvisoTareas } from '@/components/tareas/AvisoTareas'
import { AvisoReto } from '@/components/retos/AvisoReto'
import { ChatFlotante } from '@/components/chat/ChatFlotante'
import { getRetoVigente } from '@/lib/queries/retos'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sede:sedes(codigo)')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  const sedeCodigo = (Array.isArray(usuario.sede) ? usuario.sede[0] : usuario.sede)?.codigo ?? null

  // Tareas pendientes asignadas a quien está conectado: se muestran como un
  // aviso flotante abajo de la pantalla en todas las páginas.
  const { data: tareasPendientes } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion')
    .eq('asignado_a', usuario.id)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true })

  // Reto vigente de hoy. El RLS decide quién lo ve: un reto de Bucaramanga y
  // Santa Rosa no le llega a Cúcuta.
  const reto = await getRetoVigente()

  // Burbuja de chat en todas las páginas (mismo RPC que /chat; el visor no chatea).
  const { data: usuariosChat } = usuario.rol === 'visor'
    ? { data: null }
    : await supabase.rpc('chat_usuarios')

  return (
    <DashboardShell usuario={usuario} sedeCodigo={sedeCodigo}>
      {children}
      <AvisoTareas tareas={tareasPendientes ?? []} />
      {reto && (
        <AvisoReto reto={reto.reto} avances={reto.avances} grupo={reto.grupo} usuarioId={usuario.id} />
      )}
      {usuario.rol !== 'visor' && (
        <ChatFlotante
          miId={usuario.id}
          usuarios={(usuariosChat ?? []) as Array<{ id: string; nombre: string; rol: string }>}
        />
      )}
    </DashboardShell>
  )
}
