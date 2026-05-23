'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function marcarLeidaAction(notificacionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', notificacionId)
    .eq('usuario_id', user.id) // garantía: solo puede marcar las propias
}

export async function marcarTodasLeidasAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', user.id)
    .eq('leida', false)
}
