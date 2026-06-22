'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TipoMensajeria, PagoMensajeria } from '@/types'

export type RegistrarPagoMensajeriaInput = {
  mensajeria: TipoMensajeria
  monto: number
  fecha: string
  cuenta_id: string | null
  notas: string
}

export type PagoMensajeriaResult = { ok: true } | { ok: false; error: string }

export async function registrarPagoMensajeriaAction(
  data: RegistrarPagoMensajeriaInput
): Promise<PagoMensajeriaResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('pagos_mensajeria')
    .insert({
      mensajeria:    data.mensajeria,
      tipo:          'pago',
      monto:         data.monto,
      fecha:         data.fecha,
      cuenta_id:     data.cuenta_id || null,
      notas:         data.notas.trim() || null,
      responsable_id: user.id,
    })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/mensajerias')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

export type ResumenMensajeria = {
  mensajeria: TipoMensajeria
  total_deuda: number
  total_pagado: number
  saldo_pendiente: number
}

export async function getResumenMensajeriasAction(): Promise<ResumenMensajeria[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('vista_deuda_mensajerias').select('*')
  return (data ?? []) as ResumenMensajeria[]
}

export type DomicilioPendienteMensajeria = {
  id: string
  fecha: string
  cliente_nombre: string
  direccion: string
  mensajeria: TipoMensajeria
  valor_domicilio: number
  monto_deuda: number
  notas: string | null
}

export async function getDomiciliosPendientesMensajeriaAction(
  mensajeria: TipoMensajeria
): Promise<DomicilioPendienteMensajeria[]> {
  const supabase = await createClient()

  // Domicilios con tipo_cobro='tb_cobra' que aún tienen deuda pendiente
  const { data } = await supabase
    .from('pagos_mensajeria')
    .select(`
      id, monto, fecha, domicilio_id,
      domicilio:domicilios(id, fecha, cliente_nombre, direccion, mensajeria, valor_domicilio, notas)
    `)
    .eq('mensajeria', mensajeria)
    .eq('tipo', 'deuda')
    .order('fecha', { ascending: false })
    .limit(200)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.domicilio?.fecha ?? r.fecha,
    cliente_nombre: r.domicilio?.cliente_nombre ?? '',
    direccion: r.domicilio?.direccion ?? '',
    mensajeria: r.domicilio?.mensajeria ?? mensajeria,
    valor_domicilio: r.domicilio?.valor_domicilio ?? 0,
    monto_deuda: r.monto,
    notas: r.domicilio?.notas ?? null,
  }))
}

export async function getHistorialPagosMensajeriaAction(
  mensajeria: TipoMensajeria
): Promise<PagoMensajeria[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pagos_mensajeria')
    .select('*, cuenta:cuentas(nombre), responsable:usuarios(nombre)')
    .eq('mensajeria', mensajeria)
    .order('fecha', { ascending: false })
    .limit(100)
  return (data ?? []) as PagoMensajeria[]
}
