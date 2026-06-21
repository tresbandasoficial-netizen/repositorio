import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { Articulo, StockSede, CategoriaArticulo } from '@/types'

export async function getArticulos(q?: string): Promise<Articulo[]> {
  const supabase = await createClient()
  let query = supabase
    .from('articulos')
    .select('*')
    .order('marca', { ascending: true })
    .order('nombre', { ascending: true })
    .limit(200)

  if (q?.trim()) {
    const t = q.trim()
    query = query.or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo.ilike.%${t}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error cargando artículos: ${error.message}`)
  return (data ?? []) as Articulo[]
}

// Stock consolidado por (articulo, talla, sede).
// Cada combinación (articulo_id, talla) es una fila independiente en la tabla.
export type StockAgrupado = {
  key: string               // articulo_id + ':' + talla (clave única para React)
  articulo_id: string
  nombre: string
  marca: string
  talla: string | null
  categoria: CategoriaArticulo | null
  porSede: Record<string, number>  // sede_codigo o 'CENTRAL' → stock
  total: number
}

export async function getStockPorSede(): Promise<{ filas: StockAgrupado[]; sedes: string[] }> {
  const supabase = await createClient()
  const sesion = await getSesion()

  const [stockRes, sedesRes] = await Promise.all([
    supabase.from('vista_stock_por_sede').select('*'),
    supabase.from('sedes').select('id, codigo').order('codigo'),
  ])

  if (stockRes.error) throw new Error(`Error cargando stock: ${stockRes.error.message}`)

  const sedeCodigo = new Map<string, string>()
  for (const s of sedesRes.data ?? []) sedeCodigo.set(s.id, s.codigo)

  const todasSedes = (sedesRes.data ?? []).map(s => s.codigo)
  const miSede = sesion.sede_id ? sedeCodigo.get(sesion.sede_id) : undefined
  const columnasSedes = sesion.rol === 'admin'
    ? [...todasSedes, 'CENTRAL']
    : [...(miSede ? [miSede] : []), 'CENTRAL']

  // Clave única: articulo_id + talla (puede haber varios registros por articulo, uno por talla)
  const mapa = new Map<string, StockAgrupado>()
  for (const fila of (stockRes.data ?? []) as StockSede[]) {
    const codigo = fila.sede_id ? (sedeCodigo.get(fila.sede_id) ?? '?') : 'CENTRAL'

    if (sesion.rol !== 'admin' && codigo !== 'CENTRAL' && codigo !== miSede) continue

    const key = `${fila.articulo_id}:${fila.talla ?? ''}`
    let row = mapa.get(key)
    if (!row) {
      row = {
        key,
        articulo_id: fila.articulo_id,
        nombre:      fila.nombre,
        marca:       fila.marca,
        talla:       fila.talla,
        categoria:   fila.categoria,
        porSede:     {},
        total:       0,
      }
      mapa.set(key, row)
    }
    row.porSede[codigo] = (row.porSede[codigo] ?? 0) + fila.stock
    row.total += fila.stock
  }

  const filas = [...mapa.values()].sort((a, b) =>
    (a.marca + a.nombre + (a.talla ?? '')).localeCompare(b.marca + b.nombre + (b.talla ?? ''))
  )

  return { filas, sedes: columnasSedes }
}

export async function getStockArticuloSede(articuloId: string, talla: string | null, sedeId: string): Promise<number> {
  const supabase = await createClient()
  let query = supabase
    .from('vista_stock_por_sede')
    .select('stock')
    .eq('articulo_id', articuloId)
    .eq('sede_id', sedeId)

  if (talla) {
    query = query.eq('talla', talla)
  } else {
    query = query.is('talla', null)
  }

  const { data } = await query
  return (data ?? []).reduce((s: number, r: { stock: number }) => s + r.stock, 0)
}
