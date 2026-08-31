'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'

// ─── Envíos internacionales (USA) — solo admin ───────────────────────────────
// La cuenta "Davivienda" es de la transportadora de USA: su saldo es lo que TB
// tiene A FAVOR con ellos. Cada cobro de envío (caja) se registra aquí y sale
// de esa cuenta como traslado sin destino (egreso externo). No es un gasto
// operativo: el costo del envío va dentro del costo de la mercancía.

export type EnvioUsaResult = { ok: true } | { ok: false; error: string }

async function cuentaDavivienda(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('cuentas').select('id').eq('metodo_pago', 'davivienda').maybeSingle()
  return data?.id ?? null
}

export async function registrarEnvioUsaAction(data: {
  valor: number
  descripcion: string
  fecha?: string
  // Cuántas cosas venían en la caja, por tipo (para el costo por unidad).
  cant_zapatos?: number
  cant_ropa?: number
  cant_accesorios?: number
}): Promise<EnvioUsaResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja los envíos USA' }
  if (!data.valor || data.valor <= 0) return { ok: false, error: 'Escribe el valor del envío' }
  if (!data.descripcion.trim()) return { ok: false, error: 'Describe el envío (caja, guía, kilos…)' }

  const supabase = await createClient()
  const cuentaId = await cuentaDavivienda(supabase)
  if (!cuentaId) return { ok: false, error: 'No se encontró la cuenta Davivienda' }

  const fecha = data.fecha || hoyBogota()

  const { data: tr, error: eTr } = await supabase
    .from('traslados_caja')
    .insert({
      origen_cuenta_id:  cuentaId,
      destino_cuenta_id: null,
      monto:             data.valor,
      fecha,
      responsable_id:    sesion.id,
      notas:             `Envío USA: ${data.descripcion.trim()}`,
    })
    .select('id')
    .single()
  if (eTr) return { ok: false, error: eTr.message }

  const { error } = await supabase.from('envios_usa').insert({
    fecha,
    descripcion:     data.descripcion.trim(),
    valor:           data.valor,
    traslado_id:     tr.id,
    creado_por:      sesion.id,
    cant_zapatos:    Math.max(0, data.cant_zapatos ?? 0),
    cant_ropa:       Math.max(0, data.cant_ropa ?? 0),
    cant_accesorios: Math.max(0, data.cant_accesorios ?? 0),
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/envios-usa')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

// Elimina un cobro registrado por error (devuelve la plata al saldo a favor).
export async function eliminarEnvioUsaAction(id: string): Promise<EnvioUsaResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador maneja los envíos USA' }

  const supabase = await createClient()
  const { data: envio } = await supabase
    .from('envios_usa').select('traslado_id').eq('id', id).maybeSingle()
  if (!envio) return { ok: false, error: 'Registro no encontrado' }

  const { error } = await supabase.from('envios_usa').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (envio.traslado_id) {
    await supabase.from('traslados_caja').delete().eq('id', envio.traslado_id)
  }

  revalidatePath('/envios-usa')
  revalidatePath('/flujo-caja')
  return { ok: true }
}
