import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 30

export type CarteraRow = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  total_comprado: number
  total_pagado: number
  saldo: number
  pedidos_activos: number
}

export type CarteraResult = {
  clientes: CarteraRow[]
  total: number
  totalSaldo: number
  pagina: number
  totalPaginas: number
}

export async function getCartera(params?: {
  busqueda?: string
  pagina?: number
}): Promise<CarteraResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, params?.pagina ?? 1)
  const desde = (pagina - 1) * PAGE_SIZE
  const hasta = desde + PAGE_SIZE - 1

  let query = supabase
    .from('vista_cartera_clientes')
    .select('*', { count: 'exact' })
    .order('saldo', { ascending: false })
    .range(desde, hasta)

  if (params?.busqueda) {
    query = query.or(
      `nombre.ilike.%${params.busqueda}%,telefono_normalizado.ilike.%${params.busqueda}%,cedula.ilike.%${params.busqueda}%`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Error cargando cartera: ${error.message}`)

  // Sumar el total de saldo de esta página (para la nota de página)
  const clientes = (data ?? []) as CarteraRow[]
  const totalSaldo = clientes.reduce((s, c) => s + c.saldo, 0)

  const total = count ?? 0
  return {
    clientes,
    total,
    totalSaldo,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getTotalCartera(): Promise<{ clientes: number; saldo: number }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_cartera_clientes')
    .select('saldo')

  if (error) return { clientes: 0, saldo: 0 }

  const rows = (data ?? []) as Array<{ saldo: number }>
  return {
    clientes: rows.length,
    saldo: rows.reduce((s, r) => s + r.saldo, 0),
  }
}
