'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import { METODOS_SIN_CONFIRMAR } from '@/types'

export type PagoSinConfirmar = { id: string; referencia: string; metodo: string; monto: number; origen: string }

// Pagos electrónicos (transferencias/tarjeta) de HOY que aún no se han confirmado,
// para avisar al cerrar la caja. Excluye efectivo (se cuenta físico), crédito y
// recaudo de mensajería (no es dinero recibido aún).
export async function getPagosSinConfirmarAction(sedeId?: string): Promise<PagoSinConfirmar[]> {
  const sesion = await getSesion()
  const supabase = await createClient()
  const hoy = hoyBogota()

  let q = supabase
    .from('vista_pagos_unificados')
    .select('id, referencia, metodo, monto, origen, sede_id')
    .eq('fecha', hoy)
    .eq('confirmado', false)
    .not('metodo', 'in', `(${[...METODOS_SIN_CONFIRMAR].join(',')})`)

  const sede = sesion.rol === 'admin' ? sedeId : sesion.sede_id
  if (sede) q = q.eq('sede_id', sede)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; referencia: string | null; metodo: string; monto: number; origen: string }>)
    .map(p => ({ id: p.id, referencia: p.referencia ?? '—', metodo: p.metodo, monto: p.monto, origen: p.origen }))
}

export type ConfirmarPagoResult = { ok: true } | { ok: false; error: string }

// Marca un pago como confirmado/conciliado (verificado que el dinero entró).
// `origen` viene del cuadre: 'cartera' = abono de factura (pagos_factura);
// 'venta'/'abono' = pago de pedido (pagos).
export async function confirmarPagoCuadreAction(
  id: string,
  origen: string,
  confirmado: boolean,
): Promise<ConfirmarPagoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para confirmar pagos' }

  const tabla = origen === 'cartera' ? 'pagos_factura' : 'pagos'
  const supabase = await createClient()
  const { error } = await supabase.from(tabla).update({ confirmado }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/cuadre')
  return { ok: true }
}
