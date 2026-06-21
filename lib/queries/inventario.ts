import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { Articulo, StockSede, CategoriaArticulo } from '@/types'

// Catálogo de artículos (con búsqueda opcional).
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
    query = query.or(`nombre.ilike.%${t}%,marca.ilike.%${t}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error cargando artículos: ${error.message}`)
  return (data ?? []) as Articulo[]
}

// Stock consolidado por artículo y sede.
// El asesor solo ve su sede + el inventario central; el admin ve todo.
export type StockAgrupado = {
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

  // Columnas de sede a mostrar (admin: todas; asesor: su sede + central)
  const todasSedes = (sedesRes.data ?? []).map(s => s.codigo)
  const miSede = sesion.sede_id ? sedeCodigo.get(sesion.sede_id) : undefined
  const columnasSedes = sesion.rol === 'admin'
    ? [...todasSedes, 'CENTRAL']
    : [...(miSede ? [miSede] : []), 'CENTRAL']

  const mapa = new Map<string, StockAgrupado>()
  for (const fila of (stockRes.data ?? []) as StockSede[]) {
    const codigo = fila.sede_id ? (sedeCodigo.get(fila.sede_id) ?? '?') : 'CENTRAL'

    // Filtrar por acceso del asesor
    if (sesion.rol !== 'admin' && codigo !== 'CENTRAL' && codigo !== miSede) continue

    let row = mapa.get(fila.articulo_id)
    if (!row) {
      row = {
        articulo_id: fila.articulo_id,
        nombre: fila.nombre,
        marca: fila.marca,
        talla: fila.talla,
        categoria: fila.categoria,
        porSede: {},
        total: 0,
      }
      mapa.set(fila.articulo_id, row)
    }
    row.porSede[codigo] = (row.porSede[codigo] ?? 0) + fila.stock
    row.total += fila.stock
  }

  const filas = [...mapa.values()].sort((a, b) =>
    (a.marca + a.nombre).localeCompare(b.marca + b.nombre)
  )

  return { filas, sedes: columnasSedes }
}

// Stock de un artículo específico en una sede (para validar/mostrar en venta).
export async function getStockArticuloSede(articuloId: string, sedeId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vista_stock_por_sede')
    .select('stock, sede_id')
    .eq('articulo_id', articuloId)

  let total = 0
  for (const fila of (data ?? []) as Array<{ stock: number; sede_id: string | null }>) {
    if (fila.sede_id === sedeId) total += fila.stock
  }
  return total
}
