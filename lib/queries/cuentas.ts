import type { SupabaseClient } from '@supabase/supabase-js'

// Métodos que NO representan dinero en una cuenta real: no se enrutan.
//   credito            → venta a crédito, no es plata que entró
//   recaudo_mensajeria → lo cobra el mensajero, se controla aparte
//   contra_entrega     → igual que recaudo (histórico)
const METODOS_SIN_CUENTA = new Set(['credito', 'recaudo_mensajeria', 'contra_entrega'])

// Resuelve la cuenta destino de un pago a partir de su método.
//
// El método ya identifica la cuenta exacta (bancolombia_carlos, nequi_johan…):
// cada cuenta tiene `metodo_pago` con ese mismo valor (ver migración 035). Así un
// abono por "Bancolombia Carlos" suma directo a esa cuenta en el flujo de caja.
//
//   - efectivo: hay una caja por sede → se resuelve por (metodo_pago='efectivo', sede_id).
//   - resto:    cuenta global única identificada por metodo_pago = metodo.
//
// Devuelve null si el método no es una cuenta real (crédito/mensajería) o no hay match
// (en ese caso el pago queda sin cuenta, igual que antes — no rompe nada).
export async function cuentaIdPorMetodo(
  supabase: SupabaseClient,
  metodo: string,
  sedeId: string | null,
): Promise<string | null> {
  if (!metodo || METODOS_SIN_CUENTA.has(metodo)) return null

  let query = supabase
    .from('cuentas')
    .select('id')
    .eq('metodo_pago', metodo)
    .eq('activa', true)
    .limit(1)

  // El efectivo tiene una caja por sede; los demás son cuentas globales.
  if (metodo === 'efectivo') {
    if (!sedeId) return null
    query = query.eq('sede_id', sedeId)
  }

  const { data } = await query
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null
}

// Compat: resuelve la caja de efectivo de una sede. Equivale a cuentaIdPorMetodo
// con metodo='efectivo'. Se conserva para los llamados existentes.
export async function efectivoCuentaId(
  supabase: SupabaseClient,
  sedeId: string | null,
): Promise<string | null> {
  return cuentaIdPorMetodo(supabase, 'efectivo', sedeId)
}
