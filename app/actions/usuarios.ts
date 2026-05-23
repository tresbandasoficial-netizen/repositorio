'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verificarAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (usuario?.rol !== 'admin') redirect('/dashboard')
  return { supabase, adminClient: createAdminClient() }
}

// ─── Invitar nuevo usuario ────────────────────────────────────────────────────

export type InvitarUsuarioResult =
  | { ok: true }
  | { ok: false; error: string }

export async function invitarUsuarioAction(data: {
  email: string
  nombre: string
  rol: 'asesor' | 'admin'
  sede_id: string | null
}): Promise<InvitarUsuarioResult> {
  const { supabase, adminClient } = await verificarAdmin()

  // Crear usuario en Supabase Auth y enviar email de invitación
  const { data: authUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
    data.email,
    { data: { nombre: data.nombre } }
  )

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { ok: false, error: 'Este email ya está registrado.' }
    }
    return { ok: false, error: authError.message }
  }

  // Insertar en tabla usuarios con rol y sede
  const { error: insertError } = await supabase.from('usuarios').insert({
    id:       authUser.user.id,
    email:    data.email,
    nombre:   data.nombre,
    rol:      data.rol,
    sede_id:  data.sede_id || null,
    activo:   true,
  })

  if (insertError) {
    // Intentar limpiar el usuario de auth si falló la inserción
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    return { ok: false, error: `Error registrando usuario: ${insertError.message}` }
  }

  redirect('/usuarios')
}

// ─── Activar / desactivar usuario ────────────────────────────────────────────

export async function toggleActivoAction(
  usuarioId: string,
  activo: boolean
): Promise<{ ok: false; error: string } | void> {
  const { supabase } = await verificarAdmin()

  // No permitir desactivar otra cuenta de admin
  if (!activo) {
    const { data: objetivo } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', usuarioId)
      .single()

    if (objetivo?.rol === 'admin') {
      return { ok: false, error: 'No se puede desactivar una cuenta de administrador.' }
    }
  }

  await supabase
    .from('usuarios')
    .update({ activo })
    .eq('id', usuarioId)

  redirect('/usuarios')
}
