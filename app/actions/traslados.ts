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

export type IngresoInput = {
  cuenta_id: string
  monto: number
  fecha?: string
  notas?: string
}

// Registra dinero que ENTRA de afuera a una cuenta (no es venta ni traslado entre
// cuentas): aporte de capital, préstamo, devolución de proveedor, etc. Se guarda
// como un traslado sin origen (origen_cuenta_id = null), que el flujo de caja suma
// al destino sin descontar ninguna otra cuenta.
export async function registrarIngresoAction(data: IngresoInput): Promise<TrasladoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar ingresos' }
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.cuenta_id) return { ok: false, error: 'Selecciona la cuenta que recibe el dinero' }

  const supabase = await createClient()
  const { error } = await supabase.from('traslados_caja').insert({
    origen_cuenta_id:  null,
    destino_cuenta_id: data.cuenta_id,
    monto:             data.monto,
    fecha:             data.fecha || hoyBogota(),
    responsable_id:    sesion.id,
    notas:             data.notas?.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/flujo-caja')
  return { ok: true }
}
