'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizarTelefono } from '@/lib/utils/phone'

export type ClienteBusqueda = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
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
  return data ?? []
}

export type EditarClienteResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarClienteAction(
  id: string,
  formData: FormData
): Promise<EditarClienteResult> {
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
