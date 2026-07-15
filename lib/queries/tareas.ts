import { createClient } from '@/lib/supabase/server'

export type TareaRow = {
  id: string
  titulo: string
  descripcion: string | null
  asignado_a: string
  estado: 'pendiente' | 'completada'
  creado_en: string
  completada_en: string | null
  asesor_nombre: string
}

// Lista de tareas. La RLS hace el filtro: el asesor recibe solo las suyas,
// el admin todas.
export async function getTareas(): Promise<TareaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion, asignado_a, estado, creado_en, completada_en, asesor:usuarios!tareas_asignado_a_fkey(nombre)')
    .order('estado', { ascending: false })   // pendiente > completada (alfabético invertido)
    .order('creado_en', { ascending: false })
    .limit(300)

  if (error) throw new Error(`Error cargando tareas: ${error.message}`)
  return ((data ?? []) as any[]).map(t => ({
    id: t.id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    asignado_a: t.asignado_a,
    estado: t.estado,
    creado_en: t.creado_en,
    completada_en: t.completada_en,
    asesor_nombre: t.asesor?.nombre ?? '—',
  }))
}

