import { createClient } from '@/lib/supabase/server'
import { hoyBogota } from '@/lib/utils/format'

export type MetricaReto = 'ventas' | 'pedidos' | 'unidades'
export type CategoriaReto = 'ropa' | 'tenis' | 'accesorios'
// 'individual': cada uno debe llegar a la meta. 'grupal': la meta es una sola
// y la suman todos entre sí.
export type ModoReto = 'individual' | 'grupal'

export type Reto = {
  id: string
  titulo: string
  descripcion: string | null
  metrica: MetricaReto
  categoria: CategoriaReto | null
  modo: ModoReto
  objetivo: number
  sedes: string[]
  premio: string | null
  imagen_url: string | null
  desde: string
  hasta: string
  activo: boolean
  creado_en: string
}

export type AvanceReto = {
  usuario_id: string
  nombre: string
  sede: string
  valor: number
  completado_en: string | null
}

// Total del equipo en un reto grupal (null en los individuales)
export type AvanceGrupo = { valor: number; completado_en: string | null }

export type RetoConAvance = { reto: Reto; avances: AvanceReto[]; grupo: AvanceGrupo | null }

const CAMPOS =
  'id, titulo, descripcion, metrica, categoria, modo, objetivo, sedes, premio, imagen_url, desde, hasta, activo, creado_en'

// Orden del ranking: primero quienes completaron (por hora, el más temprano
// gana), después el resto por lo que llevan.
function ordenarAvances(avances: AvanceReto[]): AvanceReto[] {
  return [...avances].sort((a, b) => {
    if (a.completado_en && b.completado_en) return a.completado_en.localeCompare(b.completado_en)
    if (a.completado_en) return -1
    if (b.completado_en) return 1
    return b.valor - a.valor
  })
}

export async function getAvanceReto(retoId: string): Promise<AvanceReto[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('reto_avance', { p_reto_id: retoId })
  const filas = (data ?? []) as Array<AvanceReto & { valor: number | string }>
  return ordenarAvances(filas.map(f => ({ ...f, valor: Number(f.valor) })))
}

// Total del equipo, solo para retos grupales.
export async function getAvanceGrupo(retoId: string): Promise<AvanceGrupo | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('reto_avance_grupo', { p_reto_id: retoId })
  const fila = (data ?? [])[0] as { valor: number | string; completado_en: string | null } | undefined
  if (!fila) return null
  return { valor: Number(fila.valor), completado_en: fila.completado_en }
}

async function conAvance(reto: Reto): Promise<RetoConAvance> {
  const [avances, grupo] = await Promise.all([
    getAvanceReto(reto.id),
    reto.modo === 'grupal' ? getAvanceGrupo(reto.id) : Promise.resolve(null),
  ])
  return { reto, avances, grupo }
}

// El reto vigente HOY que le corresponde a quien está conectado. El RLS ya
// filtra por sede: a Cúcuta no le llega un reto de Bucaramanga/Santa Rosa.
export async function getRetoVigente(): Promise<RetoConAvance | null> {
  const supabase = await createClient()
  const hoy = hoyBogota()

  const { data: reto } = await supabase
    .from('retos')
    .select(CAMPOS)
    .eq('activo', true)
    .lte('desde', hoy)
    .gte('hasta', hoy)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!reto) return null
  return conAvance(reto as Reto)
}

// Todos los retos visibles (para la página /retos), con el avance de cada uno.
export async function getRetos(): Promise<RetoConAvance[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('retos')
    .select(CAMPOS)
    .order('desde', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(30)

  const retos = (data ?? []) as Reto[]
  return Promise.all(retos.map(conAvance))
}
