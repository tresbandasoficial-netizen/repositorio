'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
//
// Usa el admin client a propósito: `pagos` y `pagos_factura` NO tienen política
// RLS de UPDATE, así que un update con el cliente de usuario afecta 0 filas en
// silencio (sin error) y el chuleo no persiste. La sede del asesor se verifica
// manualmente abajo para que cada quien solo confirme pagos de su propia sede.
export async function confirmarPagoCuadreAction(
  id: string,
  origen: string,
  confirmado: boolean,
): Promise<ConfirmarPagoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para confirmar pagos' }

  const tabla = origen === 'cartera' ? 'pagos_factura' : 'pagos'
  const admin = createAdminClient()

  // El asesor solo puede confirmar pagos de su sede. El admin puede todos.
  if (sesion.rol !== 'admin') {
    const { data: pago } =
      tabla === 'pagos_factura'
        ? await admin.from('pagos_factura').select('factura:facturas(sede_id)').eq('id', id).single()
        : await admin.from('pagos').select('pedido:pedidos(sede_id)').eq('id', id).single()
    const sedePago =
      tabla === 'pagos_factura'
        ? (pago as { factura?: { sede_id: string } } | null)?.factura?.sede_id
        : (pago as { pedido?: { sede_id: string } } | null)?.pedido?.sede_id
    if (!sedePago || sedePago !== sesion.sede_id) {
      return { ok: false, error: 'Sin permisos para confirmar este pago' }
    }
  }

  const { data, error } = await admin.from(tabla).update({ confirmado }).eq('id', id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'No se encontró el pago' }

  revalidatePath('/cuadre')
  return { ok: true }
}
