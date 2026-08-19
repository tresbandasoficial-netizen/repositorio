'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'

// ─── Préstamos de terceros (deudas POR PAGAR del negocio) — solo admin ───────
// La deuda vive en prestamos_terceros; el efecto en caja va por traslados_caja:
// el ingreso del préstamo es un traslado sin origen (mig. 081) y cada abono al
// acreedor es un traslado sin destino (egreso externo, mig. 173). No se usan
// gastos porque devolver capital no es un gasto operativo (no debe bajar la
// utilidad del negocio).

export type PrestamoResult = { ok: true } | { ok: false; error: string }

export async function crearPrestamoAction(data: {
  acreedor: string
  monto: number
  fecha?: string
  notas?: string
  cuenta_id?: string | null   // si la plata ENTRÓ a una cuenta, registrar el ingreso
}): Promise<PrestamoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja préstamos' }
  if (!data.acreedor.trim()) return { ok: false, error: 'Escribe a quién le debes' }
  if (!data.monto || data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }

  const supabase = await createClient()
  const fecha = data.fecha || hoyBogota()

  // Si el dinero entró a una cuenta, registrar el ingreso externo primero.
  let ingresoId: string | null = null
  if (data.cuenta_id) {
    const { data: tr, error: eTr } = await supabase
      .from('traslados_caja')
      .insert({
        origen_cuenta_id:  null,
        destino_cuenta_id: data.cuenta_id,
        monto:             data.monto,
        fecha,
        responsable_id:    sesion.id,
        notas:             `Préstamo de ${data.acreedor.trim()}`,
      })
      .select('id')
      .single()
    if (eTr) return { ok: false, error: eTr.message }
    ingresoId = tr.id
  }

  const { error } = await supabase.from('prestamos_terceros').insert({
    acreedor:            data.acreedor.trim(),
    monto:               data.monto,
    fecha,
    notas:               data.notas?.trim() || null,
    ingreso_traslado_id: ingresoId,
    creado_por:          sesion.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/prestamos')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

export async function abonarPrestamoAction(prestamoId: string, data: {
  monto: number
  cuenta_id: string        // de qué cuenta sale la plata
  fecha?: string
  notas?: string
}): Promise<PrestamoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja préstamos' }
  if (!data.monto || data.monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' }
  if (!data.cuenta_id) return { ok: false, error: 'Selecciona de qué cuenta sale la plata' }

  const supabase = await createClient()

  const [{ data: prestamo }, { data: abonos }] = await Promise.all([
    supabase.from('prestamos_terceros').select('acreedor, monto').eq('id', prestamoId).maybeSingle(),
    supabase.from('abonos_prestamos').select('monto').eq('prestamo_id', prestamoId),
  ])
  if (!prestamo) return { ok: false, error: 'Préstamo no encontrado' }

  const abonado = (abonos ?? []).reduce((s, a) => s + a.monto, 0)
  const saldo = prestamo.monto - abonado
  if (data.monto > saldo) {
    return { ok: false, error: `El abono supera lo que falta por pagar (${saldo.toLocaleString('es-CO')})` }
  }

  const fecha = data.fecha || hoyBogota()

  // Egreso externo: la plata sale de la cuenta y no entra a ninguna otra.
  const { data: tr, error: eTr } = await supabase
    .from('traslados_caja')
    .insert({
      origen_cuenta_id:  data.cuenta_id,
      destino_cuenta_id: null,
      monto:             data.monto,
      fecha,
      responsable_id:    sesion.id,
      notas:             `Abono préstamo de ${prestamo.acreedor}`,
    })
    .select('id')
    .single()
  if (eTr) return { ok: false, error: eTr.message }

  const { error } = await supabase.from('abonos_prestamos').insert({
    prestamo_id: prestamoId,
    monto:       data.monto,
    fecha,
    cuenta_id:   data.cuenta_id,
    traslado_id: tr.id,
    notas:       data.notas?.trim() || null,
    creado_por:  sesion.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/prestamos')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

// Elimina un abono y devuelve la plata a la cuenta (borra su traslado).
export async function eliminarAbonoPrestamoAction(abonoId: string): Promise<PrestamoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja préstamos' }

  const supabase = await createClient()
  const { data: abono } = await supabase
    .from('abonos_prestamos').select('traslado_id').eq('id', abonoId).maybeSingle()
  if (!abono) return { ok: false, error: 'Abono no encontrado' }

  const { error } = await supabase.from('abonos_prestamos').delete().eq('id', abonoId)
  if (error) return { ok: false, error: error.message }
  if (abono.traslado_id) {
    await supabase.from('traslados_caja').delete().eq('id', abono.traslado_id)
  }

  revalidatePath('/prestamos')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

// Elimina un préstamo completo (con sus abonos) y revierte sus movimientos de caja.
export async function eliminarPrestamoAction(prestamoId: string): Promise<PrestamoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja préstamos' }

  const supabase = await createClient()
  const [{ data: prestamo }, { data: abonos }] = await Promise.all([
    supabase.from('prestamos_terceros').select('ingreso_traslado_id').eq('id', prestamoId).maybeSingle(),
    supabase.from('abonos_prestamos').select('traslado_id').eq('prestamo_id', prestamoId),
  ])
  if (!prestamo) return { ok: false, error: 'Préstamo no encontrado' }

  const { error } = await supabase.from('prestamos_terceros').delete().eq('id', prestamoId)
  if (error) return { ok: false, error: error.message }

  const trasladoIds = [
    prestamo.ingreso_traslado_id,
    ...(abonos ?? []).map(a => a.traslado_id),
  ].filter(Boolean) as string[]
  if (trasladoIds.length > 0) {
    await supabase.from('traslados_caja').delete().in('id', trasladoIds)
  }

  revalidatePath('/prestamos')
  revalidatePath('/flujo-caja')
  return { ok: true }
}
