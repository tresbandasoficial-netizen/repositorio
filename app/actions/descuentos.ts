'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

// ─── Descuentos a empleados por errores ──────────────────────────────────────
// El admin registra el error con su valor; el total del mes se descuenta en la
// nómina. Se anulan (no se borran) para que quede la auditoría. El RLS deja al
// empleado VER los suyos; crear y anular es solo de admin.

export type DescuentoResult = { ok: true } | { ok: false; error: string }

export async function registrarDescuentoAction(data: {
  usuario_id: string
  valor: number
  motivo: string
  fecha?: string
  pedido_ref?: string
}): Promise<DescuentoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador registra descuentos' }
  if (!data.usuario_id) return { ok: false, error: 'Selecciona el empleado' }
  if (!data.motivo.trim()) return { ok: false, error: 'Escribe el motivo del descuento (qué error fue)' }
  if (!Number.isFinite(data.valor) || data.valor <= 0) return { ok: false, error: 'El valor debe ser mayor a cero' }

  const supabase = await createClient()
  const { error } = await supabase.from('descuentos_empleados').insert({
    usuario_id: data.usuario_id,
    valor:      Math.round(data.valor),
    motivo:     data.motivo.trim(),
    ...(data.fecha ? { fecha: data.fecha } : {}),
    pedido_ref: data.pedido_ref?.trim().toUpperCase() || null,
    creado_por: sesion.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/descuentos')
  return { ok: true }
}

export async function anularDescuentoAction(id: string): Promise<DescuentoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador anula descuentos' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('descuentos_empleados')
    .update({ anulado: true })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No se encontró el descuento' }

  revalidatePath('/descuentos')
  return { ok: true }
}
