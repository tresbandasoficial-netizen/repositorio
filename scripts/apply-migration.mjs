#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const migrationPath = join(process.cwd(), 'supabase/migrations/048_fix_mensajeria_constraint.sql')
const sql = readFileSync(migrationPath, 'utf-8')

const { error } = await client.rpc('exec', { sql })

if (error) {
  console.error('Error applying migration:', error.message)
  process.exit(1)
}

console.log('Migration 048 applied successfully!')
