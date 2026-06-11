'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type DomicilioInput = {
  fecha: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  mensajeria: 'exneider' | 'servigo'
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  articulo: string
  numero_pedido: string
  notas: string
}

export type DomicilioResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function crearDomicilioAction(data: DomicilioInput): Promise<DomicilioResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: dom, error } = await supabase
    .from('domicilios')
    .insert({
      fecha:             data.fecha,
      asesor_id:         user.id,
      cliente_nombre:    data.cliente_nombre.trim(),
      cliente_telefono:  data.cliente_telefono.trim() || null,
      direccion:         data.direccion.trim(),
      mensajeria:        data.mensajeria,
      valor_domicilio:   data.valor_domicilio,
      cobrar_al_cliente: data.cobrar_al_cliente,
      metodo_pago:       data.metodo_pago,
      articulo:          data.articulo.trim() || null,
      numero_pedido:     data.numero_pedido.trim().toUpperCase() || null,
      notas:             data.notas.trim() || null,
    })
    .select('id')
    .single()

  if (error || !dom) return { ok: false, error: error?.message ?? 'Error creando domicilio' }

  revalidatePath('/domicilios')
  return { ok: true, id: dom.id }
}

export type ActualizarEstadoResult =
  | { ok: true }
  | { ok: false; error: string }

export async function actualizarEstadoDomicilioAction(
  id: string,
  estado: 'pendiente' | 'entregado'
): Promise<ActualizarEstadoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('domicilios')
    .update({ estado })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/domicilios')
  return { ok: true }
}

export type EliminarDomicilioResult =
  | { ok: true }
  | { ok: false; error: string }

export async function eliminarDomicilioAction(id: string): Promise<EliminarDomicilioResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('domicilios')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/domicilios')
  return { ok: true }
}
