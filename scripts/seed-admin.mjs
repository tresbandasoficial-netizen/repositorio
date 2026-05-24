#!/usr/bin/env node
/**
 * Bootstrap: crea el primer usuario administrador en Supabase Auth + tabla usuarios.
 *
 * Variables de entorno requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_EMAIL       (default: tresbandasoficial@gmail.com)
 *   ADMIN_PASSWORD
 *   ADMIN_NOMBRE      (default: Administrador)
 *
 * Uso:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   ADMIN_PASSWORD=tucontraseña \
 *   node scripts/seed-admin.mjs
 */

import { createClient } from '@supabase/supabase-js'

const url      = process.env.NEXT_PUBLIC_SUPABASE_URL
const key      = process.env.SUPABASE_SERVICE_ROLE_KEY
const email    = process.env.ADMIN_EMAIL    ?? 'tresbandasoficial@gmail.com'
const password = process.env.ADMIN_PASSWORD
const nombre   = process.env.ADMIN_NOMBRE   ?? 'Administrador'

if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!password) {
  console.error('Falta ADMIN_PASSWORD')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Crear o recuperar usuario en Auth ──────────────────────────────────────
const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
if (listError) { console.error('Error listando usuarios Auth:', listError.message); process.exit(1) }

let userId
const existing = users.find(u => u.email === email)

if (existing) {
  console.log(`Usuario ya existe en Auth (id: ${existing.id}) — reutilizando.`)
  userId = existing.id
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) { console.error('Error creando usuario en Auth:', error.message); process.exit(1) }
  userId = data.user.id
  console.log(`Usuario creado en Auth: ${email} (id: ${userId})`)
}

// ── 2. Insertar en tabla usuarios (service_role bypasea RLS) ─────────────────
const { data: row } = await admin.from('usuarios').select('id').eq('id', userId).maybeSingle()

if (row) {
  console.log('El usuario ya está en la tabla usuarios.')
} else {
  const { error: insertError } = await admin.from('usuarios').insert({
    id:      userId,
    email,
    nombre,
    rol:     'admin',
    sede_id: null,
    activo:  true,
  })
  if (insertError) {
    console.error('Error insertando en tabla usuarios:', insertError.message)
    process.exit(1)
  }
  console.log(`Fila insertada en usuarios: rol=admin, sede_id=null`)
}

console.log(`\nAdmin listo: ${email}`)
console.log(`Inicia sesión en la app con esas credenciales.`)
