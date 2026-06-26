'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { bloqueoCajaCerrada } from '@/lib/auth/caja'
import { efectivoCuentaId } from '@/lib/queries/cuentas'
import { MetodoPago } from '@/types'
import { hoyBogota } from '@/lib/utils/format'

export type AbonarClienteInput = {
  cliente_id: string
  monto: number
  metodo: MetodoPago
  cuenta_id: string | null
  notas: string
}

export type AbonarClienteResult =
  | { ok: true; aplicado: number; sobrante: number }
  | { ok: false; error: string }

export async function abonarClienteAction(data: AbonarClienteInput): Promise<AbonarClienteResult> {
  if (data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para registrar abonos' }
  const bloqueo = await bloqueoCajaCerrada(sesion)
  if (bloqueo) return { ok: false, error: bloqueo }
  const supabase = await createClient()

  // Toda la distribución del abono ocurre dentro de un único RPC transaccional
  // (FOR UPDATE por pedido) para evitar sobreabono por concurrencia y estados
  // inconsistentes si algo falla a mitad del proceso.
  // Efectivo: rutear a la caja de la sede del asesor si no viene cuenta.
  let cuentaId = data.cuenta_id || null
  if (!cuentaId && data.metodo === 'efectivo') cuentaId = await efectivoCuentaId(supabase, sesion.sede_id)

  const { data: res, error } = await supabase.rpc('abonar_cliente', {
    p_cliente_id: data.cliente_id,
    p_monto:      data.monto,
    p_metodo:     data.metodo,
    p_cuenta_id:  cuentaId,
    p_asesor_id:  sesion.id,
    p_fecha:      hoyBogota(),
    p_notas:      data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  const aplicado = (res as any)?.aplicado ?? 0
  const sobrante = (res as any)?.sobrante ?? data.monto
  if (aplicado === 0) return { ok: false, error: 'El cliente no tiene deuda pendiente' }

  revalidatePath(`/clientes/${data.cliente_id}`)
  revalidatePath('/cartera')
  revalidatePath('/cuadre')

  return { ok: true, aplicado, sobrante }
}
