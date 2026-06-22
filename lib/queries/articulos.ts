import { SupabaseClient } from '@supabase/supabase-js'

export async function guardarArticulo(
  supabase: SupabaseClient,
  params: {
    nombre: string
    marca: string
    codigo?: string | null
    color?: string | null
    sexo?: string | null
    categoria?: string | null
  }
): Promise<string | null> {
  const nombre    = params.nombre.trim()
  const marca     = params.marca.trim()
  const codigo    = params.codigo?.trim()    || null
  const color     = params.color?.trim()     || null
  const sexo      = params.sexo              || null
  const categoria = params.categoria         || null

  if (!nombre || !marca) return null

  const { data, error } = await supabase
    .from('articulos')
    .insert({ nombre, marca, codigo, color, sexo, categoria, activo: true })
    .select('id')
    .single()

  if (data) return data.id

  if (error?.code === '23505') {
    // Ya existe — buscar por codigo si viene, sino por marca+nombre+color+sexo
    if (codigo) {
      const { data: porCodigo } = await supabase
        .from('articulos').select('id').ilike('codigo', codigo).maybeSingle()
      if (porCodigo) return porCodigo.id
    }

    let q = supabase.from('articulos').select('id').ilike('nombre', nombre).ilike('marca', marca)
    if (color) q = q.ilike('color', color)
    else       q = q.is('color', null)
    if (sexo)  q = q.eq('sexo', sexo)
    else       q = q.is('sexo', null)

    const { data: existente } = await q.maybeSingle()
    return existente?.id ?? null
  }

  return null
}
