'use server'

import { createClient } from '@/lib/supabase/server'
import { Cuenta } from '@/types'

export async function getCuentasAction(): Promise<{ ok: true; cuentas: Cuenta[] } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('cuentas')
      .select('*')
      .eq('estado', 'activa')
      .order('nombre')

    if (error) throw new Error(error.message)
    return { ok: true, cuentas: (data ?? []) as Cuenta[] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error cargando cuentas' }
  }
}
