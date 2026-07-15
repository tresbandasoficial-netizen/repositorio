'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'

export type TareaResult = { ok: true } | { ok: false; error: string }

// El admin asigna una tarea a un asesor.
export async function crearTareaAction(data: {
  titulo: string
  descripcion: string
  asignado_a: string
}): Promise<TareaResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede asignar tareas' }
  const titulo = data.titulo.trim()
  if (!titulo) return { ok: false, error: 'Escribe el título de la tarea' }
  if (!data.asignado_a) return { ok: false, error: 'Elige a quién se la asignas' }

  const supabase = await createClient()
  const { error } = await supabase.from('tareas').insert({
    titulo,
    descripcion: data.descripcion.trim() || null,
    asignado_a: data.asignado_a,
    creada_por: sesion.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/tareas')
  return { ok: true }
}

// El asesor (dueño) o el admin marcan la tarea como completada.
export async function completarTareaAction(tareaId: string): Promise<TareaResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos' }
  const supabase = await createClient()

  // RLS garantiza que el asesor solo pueda tocar sus propias tareas.
  const { error, count } = await supabase
    .from('tareas')
    .update({ estado: 'completada', completada_en: new Date().toISOString() }, { count: 'exact' })
    .eq('id', tareaId)
    .eq('estado', 'pendiente')
  if (error) return { ok: false, error: error.message }
  if (!count) return { ok: false, error: 'La tarea no existe, no es tuya o ya estaba completada' }

  revalidatePath('/tareas')
  return { ok: true }
}

// Reabrir una tarea completada (solo admin — por si la marcaron por error).
export async function reabrirTareaAction(tareaId: string): Promise<TareaResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede reabrir tareas' }
  const supabase = await createClient()

  const { error } = await supabase
    .from('tareas')
    .update({ estado: 'pendiente', completada_en: null })
    .eq('id', tareaId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/tareas')
  return { ok: true }
}

// Eliminar una tarea (solo admin).
export async function eliminarTareaAction(tareaId: string): Promise<TareaResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo el administrador puede eliminar tareas' }
  const supabase = await createClient()

  const { error } = await supabase.from('tareas').delete().eq('id', tareaId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/tareas')
  return { ok: true }
}
