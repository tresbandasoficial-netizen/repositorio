'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import { getEfectivoEnCaja } from '@/lib/queries/cuadre'

// Efectivo que el sistema espera que haya en la caja de la sede (para el arqueo).
export async function getEfectivoEsperadoAction(sedeId?: string): Promise<{ esperado: number } | { esperado: null }> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { esperado: null }

  let codigo: string | undefined
  if (sesion.rol === 'admin' && sedeId) {
    const supabase = await createClient()
    const { data: sede } = await supabase.from('sedes').select('codigo').eq('id', sedeId).maybeSingle()
    codigo = sede?.codigo
  }
  const cajas = await getEfectivoEnCaja(codigo)
  return { esperado: cajas.reduce((s, c) => s + c.saldo, 0) }
}

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
  sede_id?: string
  efectivo_contado: number
  efectivo_esperado: number
}): Promise<CierreCajaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para cerrar caja' }
  const sedeId = sesion.rol === 'admin' ? (data.sede_id || sesion.sede_id) : sesion.sede_id
  if (!sedeId) return { ok: false, error: 'Selecciona una sede para cerrar caja.' }

  // Arqueo obligatorio: hay que contar el efectivo físico antes de cerrar.
  if (!Number.isFinite(data.efectivo_contado) || data.efectivo_contado < 0) {
    return { ok: false, error: 'Cuenta el efectivo de la caja y digita el valor para poder cerrar.' }
  }

  const supabase = await createClient()

  // Verificar que no haya ya un cierre hoy para esta sede
  const hoy = hoyBogota()
  const { data: existente } = await supabase
    .from('cierres_caja')
    .select('id')
    .eq('sede_id', sedeId)
    .eq('fecha', hoy)
    .maybeSingle()

  if (existente) return { ok: false, error: 'Ya existe un cierre de caja para hoy en esta sede' }

  const { data: cierre, error } = await supabase
    .from('cierres_caja')
    .insert({
      fecha:            hoy,
      sede_id:          sedeId,
      usuario_id:       sesion.id,
      notas:            data.notas.trim() || null,
      detalle_cuentas:  data.detalle_cuentas,
      total_ingresos:   data.total_ingresos,
      total_egresos:    data.total_egresos,
      neto:             data.neto,
      efectivo_esperado: data.efectivo_esperado,
      efectivo_contado:  data.efectivo_contado,
      diferencia:        data.efectivo_contado - data.efectivo_esperado,
    })
    .select('id')
    .single()

  if (error || !cierre) return { ok: false, error: error?.message ?? 'Error cerrando caja' }

  revalidatePath('/dashboard')
  revalidatePath('/cierres-caja')
  return { ok: true, id: cierre.id }
}

// Reabrir la caja de una sede (borra el cierre del día). Solo admin: con esto
// los asesores de esa sede vuelven a poder registrar movimientos. Usa el cliente
// de servicio porque no hay política de DELETE en cierres_caja vía RLS.
export async function reabrirCajaAction(data: {
  sede_id?: string
  fecha?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo un administrador puede reabrir la caja' }

  const sedeId = data.sede_id || sesion.sede_id
  if (!sedeId) return { ok: false, error: 'Selecciona una sede para reabrir' }
  const fecha = data.fecha || hoyBogota()

  const admin = createAdminClient()
  const { error } = await admin
    .from('cierres_caja')
    .delete()
    .eq('sede_id', sedeId)
    .eq('fecha', fecha)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/cuadre')
  return { ok: true }
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
