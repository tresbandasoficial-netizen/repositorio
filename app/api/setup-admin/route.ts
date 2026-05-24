import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Token de un solo uso — cambia esto si el endpoint queda expuesto accidentalmente.
const SETUP_TOKEN = 'TRsetup-7x4Pm9Kq2w'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // ── 1. Verificar si el usuario ya existe en Auth ──────────────────────────
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const TARGET_EMAIL = 'tresbandasoficial@gmail.com'
  let userId: string
  const existing = users.find(u => u.email === TARGET_EMAIL)

  if (existing) {
    userId = existing.id
    // Resetear contraseña por si el usuario ya existía con otra
    await admin.auth.admin.updateUserById(userId, { password: 'TR@dmin2026!' })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: 'TR@dmin2026!',
      email_confirm: true,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    userId = data.user.id
  }

  // ── 2. Verificar si ya tiene fila en usuarios ─────────────────────────────
  const { data: row } = await admin
    .from('usuarios')
    .select('id, rol')
    .eq('id', userId)
    .maybeSingle()

  if (row) {
    return NextResponse.json({
      status: 'already_exists',
      email: TARGET_EMAIL,
      rol: row.rol,
    })
  }

  // ── 3. Insertar en tabla usuarios ─────────────────────────────────────────
  const { error: insertError } = await admin.from('usuarios').insert({
    id:      userId,
    email:   TARGET_EMAIL,
    nombre:  'Administrador',
    rol:     'admin',
    sede_id: null,
    activo:  true,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    status: 'created',
    email: TARGET_EMAIL,
    password: 'TR@dmin2026!',
    rol: 'admin',
  })
}
