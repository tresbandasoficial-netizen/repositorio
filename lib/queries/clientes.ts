import { createClient } from '@/lib/supabase/server'

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

export async function getClientes(busqueda?: string): Promise<ClienteRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('clientes')
    .select(`
      id,
      nombre,
      telefono_normalizado,
      cedula,
      email,
      notas,
      creado_en,
      pedidos (fecha_creacion)
    `)
    .order('nombre', { ascending: true })

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,telefono_normalizado.ilike.%${busqueda}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Error cargando clientes: ${error.message}`)

  return (data ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    telefono_normalizado: c.telefono_normalizado,
    cedula: c.cedula,
    email: c.email,
    notas: c.notas,
    creado_en: c.creado_en,
    total_pedidos: c.pedidos?.length ?? 0,
    ultimo_pedido: c.pedidos?.length
      ? c.pedidos.sort((a: any, b: any) =>
          b.fecha_creacion.localeCompare(a.fecha_creacion)
        )[0].fecha_creacion
      : null,
  }))
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
