'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TipoMensajeria } from '@/types'

export type DomicilioInput = {
  fecha: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  mensajeria: 'exneider' | 'servigo' | 'otro'
  valor_pedido: number
  valor_domicilio: number
  cobrar_al_cliente: boolean
  metodo_pago: 'efectivo' | 'transferencia'
  tipo_cobro: 'regalado' | 'mensajero' | 'tb_cobra'
  cuenta_id: string | null
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

  // Derivar campos legacy desde tipo_cobro
  const cobrar = data.tipo_cobro !== 'regalado'
  const metodo = data.tipo_cobro === 'tb_cobra' ? 'transferencia' : 'efectivo'
  const valorPedido = metodo === 'efectivo' ? data.valor_pedido : 0

  const { data: dom, error } = await supabase
    .from('domicilios')
    .insert({
      fecha:               data.fecha,
      asesor_id:           user.id,
      cliente_nombre:      data.cliente_nombre.trim(),
      cliente_telefono:    data.cliente_telefono.trim() || null,
      direccion:           data.direccion.trim(),
      mensajeria:          data.mensajeria,
      valor_pedido:        valorPedido,
      valor_domicilio:     data.valor_domicilio,
      cobrar_al_cliente:   cobrar,
      metodo_pago:         metodo,
      tipo_cobro:          data.tipo_cobro,
      cuenta_id:           data.cuenta_id || null,
      pendiente_mensajeria: data.tipo_cobro === 'tb_cobra' && data.valor_domicilio > 0,
      articulo:            data.articulo.trim() || null,
      numero_pedido:       data.numero_pedido.trim().toUpperCase() || null,
      notas:               data.notas.trim() || null,
    })
    .select('id')
    .single()

  if (error || !dom) return { ok: false, error: error?.message ?? 'Error creando domicilio' }

  // Para tb_cobra: registrar deuda con la mensajería automáticamente
  if (data.tipo_cobro === 'tb_cobra' && data.valor_domicilio > 0) {
    await supabase.from('pagos_mensajeria').insert({
      mensajeria:     data.mensajeria as TipoMensajeria,
      tipo:           'deuda',
      monto:          data.valor_domicilio,
      fecha:          data.fecha,
      domicilio_id:   dom.id,
      responsable_id: user.id,
      notas:          `Domicilio ${data.cliente_nombre.trim()} — ${data.direccion.trim()}`,
    })
  }

  revalidatePath('/domicilios')
  revalidatePath('/mensajerias')
  return { ok: true, id: dom.id }
}

export type EditarDomicilioResult =
  | { ok: true }
  | { ok: false; error: string }

export async function editarDomicilioAction(
  id: string,
  data: DomicilioInput
): Promise<EditarDomicilioResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const cobrar = data.tipo_cobro !== 'regalado'
  const metodo = data.tipo_cobro === 'tb_cobra' ? 'transferencia' : 'efectivo'
  const valorPedido = metodo === 'efectivo' ? data.valor_pedido : 0

  const { error } = await supabase
    .from('domicilios')
    .update({
      fecha:               data.fecha,
      cliente_nombre:      data.cliente_nombre.trim(),
      cliente_telefono:    data.cliente_telefono.trim() || null,
      direccion:           data.direccion.trim(),
      mensajeria:          data.mensajeria,
      valor_pedido:        valorPedido,
      valor_domicilio:     data.valor_domicilio,
      cobrar_al_cliente:   cobrar,
      metodo_pago:         metodo,
      tipo_cobro:          data.tipo_cobro,
      cuenta_id:           data.cuenta_id || null,
      pendiente_mensajeria: data.tipo_cobro === 'tb_cobra' && data.valor_domicilio > 0,
      articulo:            data.articulo.trim() || null,
      numero_pedido:       data.numero_pedido.trim().toUpperCase() || null,
      notas:               data.notas.trim() || null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/domicilios')
  return { ok: true }
}

export type CerrarDiaResult =
  | { ok: true }
  | { ok: false; error: string }

export async function cerrarCuadreDiaAction(
  fecha: string,
  total_neto: number,
  resumen: object
): Promise<CerrarDiaResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('cuadres_domicilios')
    .upsert({ fecha, cerrado_por: user.id, total_neto, resumen }, { onConflict: 'fecha' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/domicilios')
  revalidatePath('/domicilios/cuadre')
  return { ok: true }
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
