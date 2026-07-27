'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type ConsignacionResult = { ok: true } | { ok: false; error: string }

export async function guardarLimiteConsignacionAction(
  cuentaId: string,
  limite: number | null,
  titular: string,
): Promise<ConsignacionResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo un administrador puede cambiar el tope' }
  if (limite !== null && !(limite > 0)) return { ok: false, error: 'El tope debe ser mayor a cero' }

  const supabase = await createClient()
  // Se pide la fila de vuelta para confirmar que el UPDATE tocó algo: con RLS
  // filtrando no hay error, solo cero filas, y el aviso de éxito mentiría.
  const { data, error } = await supabase
    .from('cuentas')
    .update({ limite_consignacion: limite, titular: titular.trim() || null })
    .eq('id', cuentaId)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No tienes permiso para cambiar esta cuenta' }

  revalidatePath('/consignaciones')
  return { ok: true }
}
