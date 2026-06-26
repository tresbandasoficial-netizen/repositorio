'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'

export type TrasladoInput = {
  origen_cuenta_id: string
  destino_cuenta_id: string
  monto: number
  fecha?: string
  notas?: string
}

export type TrasladoResult = { ok: true } | { ok: false; error: string }

// Registra un traslado de plata de una cuenta a otra (baja la origen, sube la
// destino). Caso típico: "Entrega de efectivo" — los asesores le dan el dinero
// al dueño, así que pasa de "Efectivo" a "Caja Bucaramanga".
export async function registrarTrasladoAction(data: TrasladoInput): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar traslados' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.origen_cuenta_id || !data.destino_cuenta_id) return { ok: false, error: 'Selecciona las cuentas de origen y destino' }
  if (data.origen_cuenta_id === data.destino_cuenta_id) return { ok: false, error: 'Las cuentas de origen y destino deben ser distintas' }

  const supabase = await createClient()
  const { error } = await supabase.from('traslados_caja').insert({
    origen_cuenta_id:  data.origen_cuenta_id,
    destino_cuenta_id: data.destino_cuenta_id,
    monto:             data.monto,
    fecha:             data.fecha || hoyBogota(),
    responsable_id:    sesion.id,
    notas:             data.notas?.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/flujo-caja')
  return { ok: true }
}
