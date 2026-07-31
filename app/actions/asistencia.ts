'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type AsistenciaResult =
  | { ok: true; accion: 'llegada' | 'salida' }
  | { ok: false; error: string }

// Marca llegada o salida según el estado del turno: si quien está conectado
// tiene un turno abierto (sin salida) lo cierra; si no, abre uno nuevo.
export async function marcarAsistenciaAction(): Promise<AsistenciaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }

  const supabase = await createClient()
  const { data: abierto, error: errBusqueda } = await supabase
    .from('asistencia')
    .select('id')
    .eq('usuario_id', sesion.id)
    .is('salida', null)
    .order('llegada', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (errBusqueda) return { ok: false, error: errBusqueda.message }

  if (abierto) {
    const { error } = await supabase
      .from('asistencia')
      .update({ salida: new Date().toISOString() })
      .eq('id', abierto.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/asistencia')
    return { ok: true, accion: 'salida' }
  }

  const { error } = await supabase.from('asistencia').insert({
    usuario_id: sesion.id,
    sede_id: sesion.sede_id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/asistencia')
  return { ok: true, accion: 'llegada' }
}

// Eliminar una marca errada (solo admin).
export async function eliminarMarcaAsistenciaAction(id: string): Promise<AsistenciaResult | { ok: true }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede eliminar marcas' }

  const supabase = await createClient()
  const { error } = await supabase.from('asistencia').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/asistencia')
  return { ok: true }
}
