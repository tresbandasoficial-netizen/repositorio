'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PerfilResult = { ok: true } | { ok: false; error: string }

export async function actualizarNombreAction(nombre: string): Promise<PerfilResult> {
  const nombre_ = nombre.trim()
  if (!nombre_) return { ok: false, error: 'El nombre no puede estar vacío' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('usuarios')
    .update({ nombre: nombre_ })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/perfil')
  return { ok: true }
}

export async function cambiarPasswordAction(
  actual: string,
  nuevo_: string,
  confirmar: string
): Promise<PerfilResult> {
  if (nuevo_.length < 8) return { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' }
  if (nuevo_ !== confirmar) return { ok: false, error: 'Las contraseñas no coinciden' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return { ok: false, error: 'No autenticado' }

  // Verificar contraseña actual re-autenticando
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: actual,
  })
  if (signInError) return { ok: false, error: 'La contraseña actual es incorrecta' }

  const { error } = await supabase.auth.updateUser({ password: nuevo_ })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
