import { createClient } from '@supabase/supabase-js'

// Cliente con service_role — solo usar en Server Actions o Route Handlers.
// Requiere SUPABASE_SERVICE_ROLE_KEY en variables de entorno (nunca en el cliente).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
