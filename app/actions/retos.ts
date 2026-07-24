'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import type { CategoriaReto, MetricaReto, ModoReto } from '@/lib/queries/retos'

export type RetoResult = { ok: true } | { ok: false; error: string }

export type NuevoReto = {
  titulo: string
  descripcion: string
  metrica: MetricaReto
  categoria: CategoriaReto | null
  modo: ModoReto
  objetivo: number
  sedes: string[]
  premio: string
  imagenes: string[]
  desde: string
  hasta: string
}

// El admin crea el reto. Solo él: la política retos_insert lo exige igual,
// esto es para dar un mensaje claro en vez de un error de base de datos.
export async function crearRetoAction(data: NuevoReto): Promise<RetoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede crear retos' }

  const titulo = data.titulo.trim()
  if (!titulo) return { ok: false, error: 'Escribe el título del reto' }
  if (!(data.objetivo > 0)) return { ok: false, error: 'La meta debe ser mayor que cero' }
  if (data.sedes.length === 0) return { ok: false, error: 'Elige al menos una sede que compita' }
  if (!data.desde || !data.hasta) return { ok: false, error: 'Faltan las fechas del reto' }
  if (data.hasta < data.desde) return { ok: false, error: 'La fecha final no puede ser antes de la inicial' }
  // La categoría solo aplica contando unidades (lo mismo exige el CHECK)
  const categoria = data.metrica === 'unidades' ? data.categoria : null

  const supabase = await createClient()
  const { error } = await supabase.from('retos').insert({
    titulo,
    descripcion: data.descripcion.trim() || null,
    metrica: data.metrica,
    categoria,
    modo: data.modo,
    objetivo: data.objetivo,
    sedes: data.sedes,
    premio: data.premio.trim() || null,
    // Tope de 2: lo exige el CHECK retos_imagenes_max, se recorta acá para dar
    // un error claro en vez de uno de base de datos.
    imagenes: data.imagenes.filter(Boolean).slice(0, 2),
    desde: data.desde,
    hasta: data.hasta,
    creado_por: sesion.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/retos')
  revalidatePath('/', 'layout') // refresca el aviso flotante en todas las páginas
  return { ok: true }
}

// Cerrar el reto: deja de aparecer como vigente, pero queda el historial.
export async function cerrarRetoAction(retoId: string): Promise<RetoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede cerrar retos' }

  const supabase = await createClient()
  const { error } = await supabase.from('retos').update({ activo: false }).eq('id', retoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/retos')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function reabrirRetoAction(retoId: string): Promise<RetoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede reabrir retos' }

  const supabase = await createClient()
  const { error } = await supabase.from('retos').update({ activo: true }).eq('id', retoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/retos')
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function eliminarRetoAction(retoId: string): Promise<RetoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede eliminar retos' }

  const supabase = await createClient()
  const { error } = await supabase.from('retos').delete().eq('id', retoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/retos')
  revalidatePath('/', 'layout')
  return { ok: true }
}
