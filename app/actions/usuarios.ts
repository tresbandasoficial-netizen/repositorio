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
  rol: 'asesor' | 'admin' | 'visor'
  sede_id: string | null
}): Promise<InvitarUsuarioResult> {
  const { adminClient } = await verificarAdmin()

  // Verificar si ya existe
  const { data: { users } } = await adminClient.auth.admin.listUsers()
  if (users.find((u) => u.email === data.email)) {
    return { ok: false, error: 'Este email ya está registrado.' }
  }

  // Crear siempre con contraseña temporal — el admin se la pasa al asesor
  const passwordTemporal = `TR${Math.random().toString(36).slice(2, 8).toUpperCase()}2026!`
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: data.email,
    password: passwordTemporal,
    email_confirm: true,
  })

  if (createError) return { ok: false, error: createError.message }

  const { error: insertError } = await adminClient.from('usuarios').insert({
    id:      created.user.id,
    email:   data.email,
    nombre:  data.nombre,
    rol:     data.rol,
    sede_id: data.sede_id || null,
    activo:  true,
  })

  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: `Error registrando usuario: ${insertError.message}` }
  }

  return { ok: true, passwordTemporal }
}

// ─── Eliminar usuario ────────────────────────────────────────────────────────

export type EliminarUsuarioResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarUsuarioAction(usuarioId: string): Promise<EliminarUsuarioResult> {
  const { supabase, adminClient } = await verificarAdmin()

  // No permitir eliminar admins ni la propia cuenta
  const { data: { user } } = await supabase.auth.getUser()
  if (usuarioId === user!.id) {
    return { ok: false, error: 'No puedes eliminar tu propia cuenta.' }
  }

  const { data: objetivo } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', usuarioId)
    .single()

  if (objetivo?.rol === 'admin') {
    return { ok: false, error: 'No se puede eliminar una cuenta de administrador.' }
  }

  // Eliminar de auth (la fila en usuarios se elimina en cascada)
  const { error } = await adminClient.auth.admin.deleteUser(usuarioId)
  if (error) return { ok: false, error: error.message }

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
