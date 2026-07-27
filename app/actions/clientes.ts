'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { normalizarTelefono } from '@/lib/utils/phone'
import { terminoBusquedaSeguro } from '@/lib/utils/busqueda'

export type ClienteBusqueda = {
  id: string
  nombre: string
  telefono_normalizado: string
  cedula: string | null
  ultima_direccion: string | null
}

export async function buscarClientesAction(busqueda: string): Promise<ClienteBusqueda[]> {
  const b = terminoBusquedaSeguro(busqueda)
  if (b.length < 2) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre, telefono_normalizado, cedula')
    .or(`nombre.ilike.%${b}%,telefono_normalizado.ilike.%${b}%`)
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
  const ciudad = (formData.get('ciudad') as string)?.trim() || null
  const direccion = (formData.get('direccion') as string)?.trim() || null
  const cumple_dia = parseInt((formData.get('cumple_dia') as string) ?? '', 10) || null
  const cumple_mes = parseInt((formData.get('cumple_mes') as string) ?? '', 10) || null

  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }
  if (!telefonoRaw) return { ok: false, error: 'El teléfono es obligatorio' }

  // Cumpleaños: día y mes van juntos (o ninguno), y el día debe existir en el mes
  if ((cumple_dia === null) !== (cumple_mes === null)) {
    return { ok: false, error: 'Para el cumpleaños elige día Y mes (o deja ambos vacíos)' }
  }
  if (cumple_dia !== null && cumple_mes !== null) {
    const diasDelMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][cumple_mes - 1] ?? 0
    if (cumple_dia < 1 || cumple_dia > diasDelMes) {
      return { ok: false, error: 'Ese día no existe en el mes elegido' }
    }
  }

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
    .update({ nombre, telefono_normalizado, cedula, email, notas, ciudad, direccion, cumple_dia, cumple_mes })
    .eq('id', id)

  if (error) return { ok: false, error: `Error al guardar: ${error.message}` }

  revalidatePath(`/clientes/${id}`)
  revalidatePath('/clientes')
  redirect(`/clientes/${id}`)
}

export type EtiquetadoResult = { ok: true } | { ok: false; error: string }

// Avance del etiquetado manual en WhatsApp (migración 139). Las etiquetas de
// WhatsApp Business se ponen a mano — no hay API — así que esto solo registra
// por dónde va el trabajo para no repetir clientes.
export async function marcarEtiquetadoAction(
  clienteId: string,
  listo: boolean,
): Promise<EtiquetadoResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para marcar clientes' }

  const supabase = await createClient()
  const { data: actualizado, error } = await supabase
    .from('clientes')
    .update({ etiquetado_whatsapp: listo ? new Date().toISOString() : null })
    .eq('id', clienteId)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!actualizado) return { ok: false, error: 'No tienes permiso para marcar este cliente' }

  revalidatePath('/recompras')
  revalidatePath(`/clientes/${clienteId}`)
  return { ok: true }
}

export type CrearClienteResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

// Crear un cliente directamente, sin necesidad de hacer un pedido o factura.
// Cualquier usuario (asesor o admin) puede; el visor no.
export async function crearClienteAction(data: {
  nombre: string
  telefono: string
  cedula?: string
  email?: string
  notas?: string
}): Promise<CrearClienteResult> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para crear clientes' }

  const supabase = await createClient()

  const nombre = data.nombre.trim()
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' }
  if (!data.telefono.trim()) return { ok: false, error: 'El teléfono es obligatorio' }

  const telefono_normalizado = normalizarTelefono(data.telefono)
  if (!telefono_normalizado) {
    return { ok: false, error: 'Teléfono inválido. Usa formato colombiano: 300 123 4567' }
  }

  // Si ya existe un cliente con ese teléfono, se reutiliza (no se duplica).
  const { data: existente } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('telefono_normalizado', telefono_normalizado)
    .maybeSingle()
  if (existente) {
    return { ok: false, error: `Ya existe un cliente con ese teléfono: "${existente.nombre}"` }
  }

  const { data: nuevo, error } = await supabase
    .from('clientes')
    .insert({
      nombre,
      telefono_normalizado,
      cedula: data.cedula?.trim() || null,
      email:  data.email?.trim() || null,
      notas:  data.notas?.trim() || null,
    })
    .select('id')
    .single()

  if (error || !nuevo) return { ok: false, error: `Error al crear el cliente: ${error?.message}` }

  revalidatePath('/clientes')
  return { ok: true, id: nuevo.id }
}
