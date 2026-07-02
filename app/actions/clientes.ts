'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { normalizarTelefono } from '@/lib/utils/phone'

export type ClienteBusqueda = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  ultima_direccion: string | null
}

export async function buscarClientesAction(busqueda: string): Promise<ClienteBusqueda[]> {
  if (busqueda.trim().length < 2) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre, telefono_normalizado, cedula')
    .or(`nombre.ilike.%${busqueda}%,telefono_normalizado.ilike.%${busqueda}%`)
    .order('nombre')
    .limit(6)

  if (!data || data.length === 0) return []

  // Buscar última dirección de domicilio por cliente
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('cliente_id, direccion_entrega, fecha_creacion')
    .in('cliente_id', data.map(c => c.id))
    .eq('tipo_entrega', 'domicilio')
    .not('direccion_entrega', 'is', null)
    .order('fecha_creacion', { ascending: false })

  const ultimasDirecciones: Record<string, string> = {}
  for (const p of pedidos ?? []) {
    if (p.cliente_id && p.direccion_entrega && !ultimasDirecciones[p.cliente_id]) {
      ultimasDirecciones[p.cliente_id] = p.direccion_entrega
    }
  }

  return data.map(c => ({
    ...c,
    ultima_direccion: ultimasDirecciones[c.id] ?? null,
  }))
}

export type ClientePorTelefono = {
  id: string
  nombre: string
  telefono_normalizado: string
  ultima_direccion: string | null
} | null

export async function buscarClientePorTelefonoAction(telefono: string): Promise<ClientePorTelefono> {
  const digitos = telefono.replace(/\D/g, '')
  if (digitos.length < 7) return null
  // Comparar por los últimos 10 dígitos: ignora el indicativo (+57) y cualquier
  // diferencia de formato entre lo escrito y lo guardado.
  const ultimos = digitos.slice(-10)
  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, telefono_normalizado')
    .ilike('telefono_normalizado', `%${ultimos}`)
    .limit(1)

  const cliente = clientes?.[0]
  if (!cliente) return null

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('direccion_entrega')
    .eq('cliente_id', cliente.id)
    .eq('tipo_entrega', 'domicilio')
    .not('direccion_entrega', 'is', null)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { ...cliente, ultima_direccion: pedido?.direccion_entrega ?? null }
}

export async function buscarDireccionPorTelefonoAction(telefono: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('telefono_normalizado', telefono)
    .maybeSingle()

  if (!cliente) return null

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('direccion_entrega')
    .eq('cliente_id', cliente.id)
    .eq('tipo_entrega', 'domicilio')
    .not('direccion_entrega', 'is', null)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle()

  return pedido?.direccion_entrega ?? null
}

export type EditarClienteResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarClienteAction(
  id: string,
  formData: FormData
): Promise<EditarClienteResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para editar clientes' }
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const nombre = (formData.get('nombre') as string)?.trim()
  const telefonoRaw = (formData.get('telefono') as string)?.trim()
  const cedula = (formData.get('cedula') as string)?.trim() || null
  const email = (formData.get('email') as string)?.trim() || null
  const notas = (formData.get('notas') as string)?.trim() || null

  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }
  if (!telefonoRaw) return { ok: false, error: 'El teléfono es obligatorio' }

  const telefono_normalizado = normalizarTelefono(telefonoRaw)
  if (!telefono_normalizado) {
    return { ok: false, error: 'Teléfono inválido. Usa formato colombiano: 300 123 4567' }
  }

  // Verificar unicidad de teléfono (excluyendo el cliente actual)
  const { data: existente } = await supabase
    .from('clientes')
    .select('id')
    .eq('telefono_normalizado', telefono_normalizado)
    .neq('id', id)
    .maybeSingle()

  if (existente) {
    return { ok: false, error: 'Ya existe otro cliente con ese número de teléfono' }
  }

  const { error } = await supabase
    .from('clientes')
    .update({ nombre, telefono_normalizado, cedula, email, notas })
    .eq('id', id)

  if (error) return { ok: false, error: `Error al guardar: ${error.message}` }

  revalidatePath(`/clientes/${id}`)
  revalidatePath('/clientes')
  redirect(`/clientes/${id}`)
}
