import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { ChatPanel } from '@/components/chat/ChatPanel'

export default async function ChatPage() {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') redirect('/dashboard')

  const supabase = await createClient()
  // RPC definer: usuarios_select solo deja al asesor leer su propia fila y aquí
  // se necesita la lista de con quién chatear (ver migración 146).
  const { data: usuarios } = await supabase.rpc('chat_usuarios')

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-4rem)]">
      <ChatPanel
        miId={sesion.id}
        usuarios={(usuarios ?? []) as Array<{ id: string; nombre: string; rol: string }>}
      />
    </div>
  )
}
