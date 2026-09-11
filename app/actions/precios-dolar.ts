'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

// ─── Precios dólar (sección Equipo) ──────────────────────────────────────────
// El admin mantiene la TRM del día y la lista de tipos de artículo con su
// valor en USD. Los asesores solo consultan (RLS: escritura solo admin).

export type PrecioDolarResult = { ok: true } | { ok: false; error: string }

export async function guardarTrmAction(valor: number): Promise<PrecioDolarResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador actualiza el valor del dólar' }
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'El valor del dólar debe ser mayor a cero' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('configuracion')
    .upsert({
      clave: 'trm_dolar',
      valor: String(valor),
      actualizado_en: new Date().toISOString(),
      actualizado_por: sesion.id,
    })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/precios-dolar')
  return { ok: true }
}

export async function crearPrecioDolarAction(data: {
  tipo_articulo: string
  valor_usd: number
}): Promise<PrecioDolarResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador agrega precios' }
  if (!data.tipo_articulo.trim()) return { ok: false, error: 'Escribe el tipo de artículo' }
  if (!Number.isFinite(data.valor_usd) || data.valor_usd <= 0) return { ok: false, error: 'El valor en dólares debe ser mayor a cero' }

  const supabase = await createClient()
  const { error } = await supabase.from('precios_dolar').insert({
    tipo_articulo: data.tipo_articulo.trim(),
    valor_usd: data.valor_usd,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/precios-dolar')
  return { ok: true }
}

export async function editarPrecioDolarAction(id: string, data: {
  tipo_articulo: string
  valor_usd: number
}): Promise<PrecioDolarResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador edita precios' }
  if (!data.tipo_articulo.trim()) return { ok: false, error: 'Escribe el tipo de artículo' }
  if (!Number.isFinite(data.valor_usd) || data.valor_usd <= 0) return { ok: false, error: 'El valor en dólares debe ser mayor a cero' }

  const supabase = await createClient()
  const { data: fila, error } = await supabase
    .from('precios_dolar')
    .update({
      tipo_articulo: data.tipo_articulo.trim(),
      valor_usd: data.valor_usd,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!fila) return { ok: false, error: 'No se encontró el precio' }

  revalidatePath('/precios-dolar')
  return { ok: true }
}

export async function eliminarPrecioDolarAction(id: string): Promise<PrecioDolarResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador elimina precios' }

  const supabase = await createClient()
  const { error } = await supabase.from('precios_dolar').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/precios-dolar')
  return { ok: true }
}
