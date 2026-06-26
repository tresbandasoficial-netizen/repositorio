import type { SupabaseClient } from '@supabase/supabase-js'

// Resuelve la cuenta de efectivo de una sede (la que tiene metodo_pago='efectivo').
// Se usa para rutear los pagos en efectivo a la caja de la sede correspondiente,
// en vez de dejarlos sin cuenta. Si no hay ninguna, devuelve null (el pago queda
// sin cuenta, igual que antes — no rompe nada).
export async function efectivoCuentaId(
  supabase: SupabaseClient,
  sedeId: string | null,
): Promise<string | null> {
  if (!sedeId) return null
  const { data } = await supabase
    .from('cuentas')
    .select('id')
    .eq('sede_id', sedeId)
    .eq('metodo_pago', 'efectivo')
    .eq('activa', true)
    .limit(1)
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null
}
