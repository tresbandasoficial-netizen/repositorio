'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type ItemConteo = {
  articulo_id: string
  talla: string | null
  cantidad: number
}

export type ConteoResult =
  | { ok: true; ajustes: number }
  | { ok: false; error: string }

// Registra un conteo físico de inventario: el stock de cada artículo+talla
// contado queda fijado exactamente en la cantidad contada (vía ajustes).
// El RPC valida permisos: admin cualquier sede, asesor solo la suya.
export async function registrarConteoAction(
  sedeId: string,
  items: ItemConteo[]
): Promise<ConteoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar conteos' }
  if (items.length === 0) return { ok: false, error: 'Agrega al menos un artículo contado' }
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('registrar_conteo_inventario', {
    p_sede_id:    sedeId,
    p_items:      items,
    p_usuario_id: sesion.id,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/inventario')
  return { ok: true, ajustes: (data as number) ?? 0 }
}
