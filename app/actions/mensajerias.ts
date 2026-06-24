'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TipoMensajeria, PagoMensajeria } from '@/types'

// ─── Cuadre por mensajería ────────────────────────────────────────────────────

export type CuadreMensajeria = {
  mensajeria: TipoMensajeria
  recaudos_pendientes: number  // mensajero nos debe (cobró al cliente)
  domicilios_tb: number        // TB le debe (domicilios que TB asumió)
  saldo_neto: number           // positivo = mensajero nos paga; negativo = TB le paga
}

export async function getCuadresMensajeriasAction(): Promise<CuadreMensajeria[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select('mensajeria, monto, concepto')
    .eq('tipo', 'deuda')
    .eq('estado', 'pendiente')

  const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo']

  return MENSAJERIAS.map(m => {
    const rows = (data ?? []).filter((r: any) => r.mensajeria === m)
    const recaudos  = rows.filter((r: any) => r.concepto === 'recaudo').reduce((s: number, r: any) => s + r.monto, 0)
    const domicilios = rows.filter((r: any) => r.concepto !== 'recaudo').reduce((s: number, r: any) => s + r.monto, 0)
    return {
      mensajeria: m,
      recaudos_pendientes: recaudos,
      domicilios_tb: domicilios,
      saldo_neto: recaudos - domicilios,
    }
  })
}

// ─── Recaudos pendientes ──────────────────────────────────────────────────────

export type RecaudoPendiente = {
  id: string
  fecha: string
  monto: number
  notas: string | null
  numero_factura: string | null
  cliente_nombre: string | null
}

export async function getRecaudosPendientesAction(
  mensajeria: TipoMensajeria
): Promise<RecaudoPendiente[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select(`
      id, monto, fecha, notas,
      factura:facturas(numero_factura, cliente:clientes(nombre))
    `)
    .eq('mensajeria', mensajeria)
    .eq('concepto', 'recaudo')
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: false })

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    monto: r.monto,
    notas: r.notas ?? null,
    numero_factura: r.factura?.numero_factura ?? null,
    cliente_nombre: r.factura?.cliente?.nombre ?? null,
  }))
}

// ─── Domicilios TB pendientes ─────────────────────────────────────────────────

export type DomicilioTBPendiente = {
  id: string
  fecha: string
  monto: number
  notas: string | null
  numero_factura: string | null
  cliente_nombre: string | null
  es_legacy: boolean
}

export async function getDomiciliosTBPendientesAction(
  mensajeria: TipoMensajeria
): Promise<DomicilioTBPendiente[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select(`
      id, monto, fecha, notas, concepto,
      factura:facturas(numero_factura, cliente:clientes(nombre))
    `)
    .eq('mensajeria', mensajeria)
    .eq('tipo', 'deuda')
    .or('concepto.eq.domicilio_tb,concepto.is.null')
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: false })

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    monto: r.monto,
    notas: r.notas ?? null,
    numero_factura: r.factura?.numero_factura ?? null,
    cliente_nombre: r.factura?.cliente?.nombre ?? null,
    es_legacy: r.concepto === null,
  }))
}

// ─── Historial de liquidaciones ───────────────────────────────────────────────

export type LiquidacionEntry = {
  id: string
  fecha: string
  monto: number
  notas: string | null
  cuenta_nombre: string | null
}

export async function getLiquidacionesHistorialAction(
  mensajeria: TipoMensajeria
): Promise<LiquidacionEntry[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select('id, monto, fecha, notas, cuenta:cuentas(nombre)')
    .eq('mensajeria', mensajeria)
    .eq('concepto', 'liquidacion')
    .order('fecha', { ascending: false })
    .limit(30)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    monto: r.monto,
    notas: r.notas ?? null,
    cuenta_nombre: (r.cuenta as any)?.nombre ?? null,
  }))
}

// ─── Liquidar mensajería ──────────────────────────────────────────────────────

export type LiquidarInput = {
  mensajeria: TipoMensajeria
  monto: number
  fecha: string
  cuenta_id: string | null
  notas: string
}

export type LiquidarResult = { ok: true } | { ok: false; error: string }

export async function liquidarMensajeriaAction(
  data: LiquidarInput
): Promise<LiquidarResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase.rpc('liquidar_mensajeria', {
    p_mensajeria:     data.mensajeria,
    p_monto:          data.monto,
    p_fecha:          data.fecha,
    p_cuenta_id:      data.cuenta_id || null,
    p_responsable_id: user.id,
    p_notas:          data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/mensajerias')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

// ─── Legacy (conservado para compatibilidad) ──────────────────────────────────

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
      mensajeria:     data.mensajeria,
      tipo:           'pago',
      monto:          data.monto,
      fecha:          data.fecha,
      cuenta_id:      data.cuenta_id || null,
      notas:          data.notas.trim() || null,
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

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select(`
      id, monto, fecha, domicilio_id,
      domicilio:domicilios(id, fecha, cliente_nombre, direccion, mensajeria, valor_domicilio, notas)
    `)
    .eq('mensajeria', mensajeria)
    .eq('tipo', 'deuda')
    .eq('estado', 'pendiente')
    .or('concepto.is.null,concepto.eq.domicilio_tb')
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
