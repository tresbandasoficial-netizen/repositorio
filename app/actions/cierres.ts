'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type DetalleCuenta = {
  cuenta_id: string
  cuenta_nombre: string
  tipo: string
  ingresos: number
  egresos: number
  neto: number
}

export type CierreCaja = {
  id: string
  fecha: string
  hora_cierre: string
  sede_id: string
  sede_nombre: string
  usuario_id: string
  usuario_nombre: string
  notas: string | null
  detalle_cuentas: DetalleCuenta[]
  total_ingresos: number
  total_egresos: number
  neto: number
  creado_en: string
}

export type CierreCajaResult = { ok: true; id: string } | { ok: false; error: string }

export async function cerrarCajaAction(data: {
  notas: string
  detalle_cuentas: DetalleCuenta[]
  total_ingresos: number
  total_egresos: number
  neto: number
}): Promise<CierreCajaResult> {
  const sesion = await getSesion()
  const supabase = await createClient()

  // Verificar que no haya ya un cierre hoy para esta sede
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: existente } = await supabase
    .from('cierres_caja')
    .select('id')
    .eq('sede_id', sesion.sede_id)
    .eq('fecha', hoy)
    .maybeSingle()

  if (existente) return { ok: false, error: 'Ya existe un cierre de caja para hoy en esta sede' }

  const { data: cierre, error } = await supabase
    .from('cierres_caja')
    .insert({
      fecha:            hoy,
      sede_id:          sesion.sede_id,
      usuario_id:       sesion.id,
      notas:            data.notas.trim() || null,
      detalle_cuentas:  data.detalle_cuentas,
      total_ingresos:   data.total_ingresos,
      total_egresos:    data.total_egresos,
      neto:             data.neto,
    })
    .select('id')
    .single()

  if (error || !cierre) return { ok: false, error: error?.message ?? 'Error cerrando caja' }

  revalidatePath('/dashboard')
  revalidatePath('/cierres-caja')
  return { ok: true, id: cierre.id }
}

export async function getCierresAction(params?: {
  sede_id?: string
  desde?: string
  hasta?: string
}): Promise<CierreCaja[]> {
  const supabase = await createClient()

  let q = supabase
    .from('cierres_caja')
    .select('*, sede:sedes(nombre), usuario:usuarios(nombre)')
    .order('fecha', { ascending: false })
    .order('hora_cierre', { ascending: false })
    .limit(60)

  if (params?.sede_id) q = q.eq('sede_id', params.sede_id)
  if (params?.desde)   q = q.gte('fecha', params.desde)
  if (params?.hasta)   q = q.lte('fecha', params.hasta)

  const { data } = await q
  return (data ?? []).map((r: any) => ({
    ...r,
    sede_nombre:    r.sede?.nombre ?? '',
    usuario_nombre: r.usuario?.nombre ?? '',
  }))
}
