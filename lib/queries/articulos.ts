import { SupabaseClient } from '@supabase/supabase-js'

// Busca o crea un artículo en el catálogo dado marca + nombre.
// Retorna el UUID del artículo, o null si no se pudo crear.
export async function guardarArticulo(
  supabase: SupabaseClient,
  params: {
    nombre: string
    marca: string
    color?: string | null
    sexo?: string | null
    categoria?: string | null
  }
): Promise<string | null> {
  const nombre    = params.nombre.trim()
  const marca     = params.marca.trim()
  const color     = params.color?.trim()     || null
  const sexo      = params.sexo              || null
  const categoria = params.categoria         || null

  if (!nombre || !marca) return null

  const { data, error } = await supabase
    .from('articulos')
    .insert({ nombre, marca, color, sexo, categoria, activo: true })
    .select('id')
    .single()

  if (data) return data.id

  if (error?.code === '23505') {
    // Ya existe — buscar por coincidencia de marca+nombre+color+sexo
    let q = supabase
      .from('articulos')
      .select('id')
      .ilike('nombre', nombre)
      .ilike('marca',  marca)

    if (color) q = q.ilike('color', color)
    else       q = q.is('color', null)

    if (sexo) q = q.eq('sexo', sexo)
    else      q = q.is('sexo', null)

    const { data: existente } = await q.maybeSingle()
    return existente?.id ?? null
  }

  return null
}
