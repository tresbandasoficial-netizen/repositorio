import { createClient } from '@/lib/supabase/server'

export type EnvioRow = {
  id: string
  consecutivo: number
  creado_en: string
  notas: string | null
  destino_nombre: string
  destino_codigo: string
  creado_por_nombre: string | null
  total_items: number
}

export type EnvioItem = {
  id: string
  pedido_id: string | null
  numero_orden: string | null
  codigo: string | null
  talla: string | null
  cantidad: number
  descripcion: string | null
}

export type EnvioDetalle = {
  id: string
  consecutivo: number
  creado_en: string
  notas: string | null
  destino_nombre: string
  destino_codigo: string
  origen_nombre: string | null
  creado_por_nombre: string | null
  items: EnvioItem[]
}

export async function getEnvios(): Promise<EnvioRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('envios')
    .select('id, consecutivo, creado_en, notas, destino:sedes!envios_destino_sede_id_fkey(nombre, codigo), usuario:usuarios(nombre), envio_items(count)')
    .order('creado_en', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Error cargando envíos: ${error.message}`)

  return ((data ?? []) as any[]).map(e => ({
    id: e.id,
    consecutivo: e.consecutivo,
    creado_en: e.creado_en,
    notas: e.notas,
    destino_nombre: e.destino?.nombre ?? '—',
    destino_codigo: e.destino?.codigo ?? '',
    creado_por_nombre: e.usuario?.nombre ?? null,
    total_items: e.envio_items?.[0]?.count ?? 0,
  }))
}

export async function getEnvioDetalle(id: string): Promise<EnvioDetalle | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('envios')
    .select(`
      id, consecutivo, creado_en, notas,
      destino:sedes!envios_destino_sede_id_fkey(nombre, codigo),
      origen:sedes!envios_origen_sede_id_fkey(nombre),
      usuario:usuarios(nombre),
      envio_items(id, pedido_id, numero_orden, codigo, talla, cantidad, descripcion, creado_en)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Error cargando el envío: ${error.message}`)
  if (!data) return null

  const e = data as any
  return {
    id: e.id,
    consecutivo: e.consecutivo,
    creado_en: e.creado_en,
    notas: e.notas,
    destino_nombre: e.destino?.nombre ?? '—',
    destino_codigo: e.destino?.codigo ?? '',
    origen_nombre: e.origen?.nombre ?? null,
    creado_por_nombre: e.usuario?.nombre ?? null,
    items: (e.envio_items ?? [])
      .sort((a: any, b: any) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''))
      .map((it: any) => ({
        id: it.id,
        pedido_id: it.pedido_id,
        numero_orden: it.numero_orden,
        codigo: it.codigo,
        talla: it.talla,
        cantidad: it.cantidad,
        descripcion: it.descripcion,
      })),
  }
}
