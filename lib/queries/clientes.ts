import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 30

export type ClientesResult = {
  clientes: ClienteRow[]
  total: number
  pagina: number
  totalPaginas: number
}

export type ClienteRow = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  email: string | null
  notas: string | null
  creado_en: string
  total_pedidos: number
  ultimo_pedido: string | null
}

export type ClienteDetalle = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  email: string | null
  notas: string | null
  creado_en: string
  pedidos: Array<{
    id: string
    numero_orden: string
    estado: string
    total: number
    total_pagado: number
    fecha_creacion: string
    sede_nombre: string
    asesor_nombre: string
  }>
}

export async function getClientes(params?: {
  busqueda?: string
  pagina?: number
}): Promise<ClientesResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, params?.pagina ?? 1)
  const desde  = (pagina - 1) * PAGE_SIZE
  const hasta  = desde + PAGE_SIZE - 1

  let query = supabase
    .from('clientes')
    .select(`
      id, nombre, telefono_normalizado, cedula, email, notas, creado_en,
      pedidos (fecha_creacion)
    `, { count: 'exact' })
    .order('nombre', { ascending: true })
    .range(desde, hasta)

  if (params?.busqueda) {
    query = query.or(
      `nombre.ilike.%${params.busqueda}%,telefono_normalizado.ilike.%${params.busqueda}%,cedula.ilike.%${params.busqueda}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Error cargando clientes: ${error.message}`)

  const total = count ?? 0
  return {
    clientes: (data ?? []).map((c: any) => ({
      id:                   c.id,
      nombre:               c.nombre,
      telefono_normalizado: c.telefono_normalizado,
      cedula:               c.cedula,
      email:                c.email,
      notas:                c.notas,
      creado_en:            c.creado_en,
      total_pedidos:        c.pedidos?.length ?? 0,
      ultimo_pedido:        c.pedidos?.length
        ? c.pedidos.sort((a: any, b: any) =>
            b.fecha_creacion.localeCompare(a.fecha_creacion)
          )[0].fecha_creacion
        : null,
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getClienteDetalle(id: string): Promise<ClienteDetalle | null> {
  const supabase = await createClient()

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nombre, telefono_normalizado, cedula, email, notas, creado_en')
    .eq('id', id)
    .single()

  if (error || !cliente) return null

  const { data: pedidos } = await supabase
    .from('vista_pedidos_asesor')
    .select('id, numero_orden, estado, total, total_pagado, fecha_creacion, sede_nombre, asesor_nombre')
    .eq('cliente_id', id)
    .order('fecha_creacion', { ascending: false })

  return {
    ...cliente,
    pedidos: (pedidos ?? []) as ClienteDetalle['pedidos'],
  }
}
