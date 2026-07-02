'use server'

import { createClient } from '@/lib/supabase/server'
import { Cuenta } from '@/types'

export async function getCuentasAction(): Promise<Cuenta[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cuentas')
    .select('*, sede:sedes(codigo,nombre)')
    .eq('activa', true)
    .order('orden')
  return (data ?? []) as Cuenta[]
}
