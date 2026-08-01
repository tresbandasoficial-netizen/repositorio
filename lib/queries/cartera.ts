import { createClient } from '@/lib/supabase/server'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'

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
  // Los dos bolsillos del crédito: lo ya entregado/facturado (deuda real por
  // cobrar) y lo que está en pedidos sin facturar (mercancía en camino).
  saldo_entregado: number
  saldo_proceso: number
  pedidos_entregados: number
  pedidos_proceso: number
}

export type CarteraResult = {
  clientes: CarteraRow[]
  total: number
  totalSaldo: number
  totalEntregado: number
  totalProceso: number
  pagina: number
  totalPaginas: number
}

export async function getCartera(params?: {
  busqueda?: string
  pagina?: number
  sede?: string   // código de sede (TR/CR/SR); si viene, cartera de esa sede
}): Promise<CarteraResult> {
  const supabase = await createClient()
  const pagina = Math.max(1, params?.pagina ?? 1)
  const desde = (pagina - 1) * PAGE_SIZE
  const hasta = desde + PAGE_SIZE - 1

  // Sin sede: cartera por cliente (todas las sedes). Con sede: cartera de esa sede.
  let query = params?.sede
    ? supabase.from('vista_cartera_cliente_sede').select('*', { count: 'exact' }).eq('sede_codigo', params.sede)
    : supabase.from('vista_cartera_clientes').select('*', { count: 'exact' })
  query = query
    .order('saldo', { ascending: false })
    .range(desde, hasta)

  if (params?.busqueda) {
    const b = terminoBusquedaSeguro(params.busqueda)
    if (b) query = query.or(
      `nombre.ilike.%${b}%,telefono_normalizado.ilike.%${b}%,cedula.ilike.%${b}%`
    )
  }

  const { data, error, count } = await query
  // PGRST103: la página pedida quedó más allá del total (p.ej. filtró estando
  // en una página alta) — volver a la página 1.
  if (error?.message.includes('Requested range not satisfiable') && pagina > 1) {
    return getCartera({ ...params, pagina: 1 })
  }
  if (error) throw new Error(`Error cargando cartera: ${error.message}`)

  // Sumar el total de saldo de esta página (para la nota de página)
  const clientes = (data ?? []) as CarteraRow[]
  const totalSaldo = clientes.reduce((s, c) => s + c.saldo, 0)

  const total = count ?? 0
  return {
    clientes,
    total,
    totalSaldo,
    totalEntregado: clientes.reduce((s, c) => s + (c.saldo_entregado ?? 0), 0),
    totalProceso:   clientes.reduce((s, c) => s + (c.saldo_proceso ?? 0), 0),
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getTotalCartera(sede?: string): Promise<{
  clientes: number; saldo: number; entregado: number; proceso: number
}> {
  const supabase = await createClient()
  const base = sede
    ? supabase.from('vista_cartera_cliente_sede').select('saldo, saldo_entregado, saldo_proceso').eq('sede_codigo', sede)
    : supabase.from('vista_cartera_clientes').select('saldo, saldo_entregado, saldo_proceso')
  const { data, error } = await base

  if (error) return { clientes: 0, saldo: 0, entregado: 0, proceso: 0 }

  const rows = (data ?? []) as Array<{ saldo: number; saldo_entregado: number; saldo_proceso: number }>
  return {
    clientes: rows.length,
    saldo: rows.reduce((s, r) => s + r.saldo, 0),
    entregado: rows.reduce((s, r) => s + (r.saldo_entregado ?? 0), 0),
    proceso: rows.reduce((s, r) => s + (r.saldo_proceso ?? 0), 0),
  }
}
