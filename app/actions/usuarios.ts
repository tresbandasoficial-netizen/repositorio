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
  | { ok: true; passwordTemporal?: string }
  | { ok: false; error: string }

export async function invitarUsuarioAction(data: {
  email: string
  nombre: string
  rol: 'asesor' | 'admin'
  sede_id: string | null
}): Promise<InvitarUsuarioResult> {
  const { supabase, adminClient } = await verificarAdmin()

  // Intentar primero con invitación por email (si Supabase tiene SMTP)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data: authUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
    data.email,
    {
      data: { nombre: data.nombre },
      redirectTo: `${siteUrl}/auth/callback?type=invite`,
    }
  )

  let userId: string
  let passwordTemporal: string | undefined

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { ok: false, error: 'Este email ya está registrado.' }
    }

    // Si falla el email (SMTP no configurado), crear usuario con contraseña temporal
    const temp = `TR${Math.random().toString(36).slice(2, 8).toUpperCase()}2026!`
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password: temp,
      email_confirm: true,
    })

    if (createError) return { ok: false, error: createError.message }
    userId = created.user.id
    passwordTemporal = temp
  } else {
    userId = authUser.user.id
  }

  const { error: insertError } = await adminClient.from('usuarios').insert({
    id:      userId,
    email:   data.email,
    nombre:  data.nombre,
    rol:     data.rol,
    sede_id: data.sede_id || null,
    activo:  true,
  })

  if (insertError) {
    await adminClient.auth.admin.deleteUser(userId)
    return { ok: false, error: `Error registrando usuario: ${insertError.message}` }
  }

  // Si se creó con contraseña temporal, devolver para mostrarla al admin
  if (passwordTemporal) {
    return { ok: true, passwordTemporal }
  }

  redirect('/usuarios')
}

// ─── Activar / desactivar usuario ────────────────────────────────────────────

export async function toggleActivoAction(
  usuarioId: string,
  activo: boolean
): Promise<{ ok: false; error: string } | void> {
  const { supabase, adminClient } = await verificarAdmin()

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

  await adminClient
    .from('usuarios')
    .update({ activo })
    .eq('id', usuarioId)

  redirect('/usuarios')
}
