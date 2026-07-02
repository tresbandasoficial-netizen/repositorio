import { createClient } from '@/lib/supabase/server'
import { hoyBogota } from '@/lib/utils/format'
import type { SesionUsuario } from '@/lib/auth/acceso'

// ¿La caja de esta sede ya está cerrada hoy (hora Bogotá)?
export async function cajaCerradaHoy(sedeId: string | null): Promise<boolean> {
  if (!sedeId) return false
  const supabase = await createClient()
  const { data } = await supabase
    .from('cierres_caja')
    .select('id')
    .eq('sede_id', sedeId)
    .eq('fecha', hoyBogota())
    .maybeSingle()
  return !!data
}

// Devuelve un mensaje de bloqueo si la caja de la sede del usuario está cerrada
// hoy. El admin siempre puede registrar o corregir movimientos (bypass total).
// Para los asesores la sede relevante es la suya (sesion.sede_id): solo operan
// en su propia sede, así que con ese cierre basta para bloquearlos.
// Devuelve null cuando SÍ se puede escribir.
export async function bloqueoCajaCerrada(sesion: SesionUsuario): Promise<string | null> {
  if (sesion.rol === 'admin') return null
  if (await cajaCerradaHoy(sesion.sede_id)) {
    return 'La caja de tu sede ya está cerrada hoy. Solo un administrador puede registrar o modificar movimientos.'
  }
  return null
}
