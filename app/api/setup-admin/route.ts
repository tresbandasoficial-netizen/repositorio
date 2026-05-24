import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SETUP_TOKEN = 'TRsetup-7x4Pm9Kq2w'
const TARGET_EMAIL = 'tresbandasoficial@gmail.com'
const TARGET_PASSWORD = 'TR@dmin2026!'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const log: string[] = []

  const { data: listData, error: listError } = await admin.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ step: 'list_users', error: listError.message }, { status: 500 })
  }

  const existing = listData.users.find(u => u.email === TARGET_EMAIL)
  let userId: string

  if (existing) {
    userId = existing.id
    log.push(`usuario_encontrado: ${userId}`)
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: TARGET_PASSWORD,
      email_confirm: true,
    })
    if (updateError) {
      return NextResponse.json({ step: 'update_password', error: updateError.message }, { status: 500 })
    }
    log.push('contraseña_reseteada: ok')
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
    })
    if (createError) {
      return NextResponse.json({ step: 'create_user', error: createError.message }, { status: 500 })
    }
    userId = created.user.id
    log.push(`usuario_creado: ${userId}`)
  }

  const { data: row } = await admin
    .from('usuarios')
    .select('id, rol')
    .eq('id', userId)
    .maybeSingle()

  if (row) {
    log.push(`tabla_usuarios: ya_existe (rol=${row.rol})`)
  } else {
    const { error: insertError } = await admin.from('usuarios').insert({
      id:      userId,
      email:   TARGET_EMAIL,
      nombre:  'Administrador',
      rol:     'admin',
      sede_id: null,
      activo:  true,
    })
    if (insertError) {
      return NextResponse.json({ step: 'insert_usuarios', error: insertError.message }, { status: 500 })
    }
    log.push('tabla_usuarios: insertado (rol=admin)')
  }

  return NextResponse.json({ ok: true, email: TARGET_EMAIL, password: TARGET_PASSWORD, log })
}
