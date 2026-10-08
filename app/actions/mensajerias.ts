'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TipoMensajeria, PagoMensajeria } from '@/types'

// ─── Cuadre por mensajería ────────────────────────────────────────────────────

export type CuadreMensajeria = {
  mensajeria: TipoMensajeria
  recaudos_pendientes: number  // lo que el mensajero cobró a clientes y aún no ha entregado
  cobros_pendientes: number    // cuántos cobros
}

export async function getCuadresMensajeriasAction(): Promise<CuadreMensajeria[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('pagos_mensajeria')
    .select('mensajeria, monto')
    .eq('tipo', 'deuda')
    .eq('concepto', 'recaudo')
    .eq('estado', 'pendiente')

  const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo']

  return MENSAJERIAS.map(m => {
    const rows = (data ?? []).filter((r: any) => r.mensajeria === m)
    return {
      mensajeria: m,
      recaudos_pendientes: rows.reduce((s: number, r: any) => s + r.monto, 0),
      cobros_pendientes: rows.length,
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

// ─── Domicilios que paga TB (solo consulta) ───────────────────────────────────
// Lista para confirmar contra lo que apunta el mensajero. No suma ni descuenta
// nada en ninguna parte: el descuento se registra a mano en Gastos.

export type DomicilioPagadoTB = {
  id: string
  fecha: string
  cliente_nombre: string
  valor: number
  numero_factura: string | null
}

export async function getDomiciliosPagadosTBAction(
  mensajeria: TipoMensajeria,
  desde: string
): Promise<DomicilioPagadoTB[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('domicilios')
    .select('id, fecha, cliente_nombre, valor_domicilio, factura:facturas(numero_factura, estado)')
    .eq('mensajeria', mensajeria)
    .eq('tipo_cobro', 'tb_cobra')
    .gt('valor_domicilio', 0)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  return (data ?? [])
    .filter((r: any) => r.factura?.estado !== 'anulada')
    .map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      cliente_nombre: r.cliente_nombre,
      valor: r.valor_domicilio,
      numero_factura: r.factura?.numero_factura ?? null,
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

// ─── Cuadrar mensajería (cobro por cobro) ─────────────────────────────────────
// El dueño marca los cobros que el mensajero le entregó (con el valor recogido).
// El RPC marca los cobros como liquidados, los domicilios de esas facturas como
// entregados y mete todo lo recogido a Efectivo Bucaramanga. No descuenta
// domicilios: ese gasto se registra a mano en Gastos.

export type CuadrarInput = {
  mensajeria: TipoMensajeria
  fecha: string
  items: Array<{ id: string; monto: number }>
  notas: string
}

export type CuadrarResult =
  | { ok: true; cobros: number; recogido: number }
  | { ok: false; error: string }

export async function cuadrarMensajeriaAction(data: CuadrarInput): Promise<CuadrarResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: r, error } = await supabase.rpc('cuadrar_mensajeria', {
    p_mensajeria:     data.mensajeria,
    p_items:          data.items,
    p_fecha:          data.fecha,
    p_cuenta_id:      null,
    p_responsable_id: user.id,
    p_notas:          data.notas.trim() || null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/mensajerias')
  revalidatePath('/flujo-caja')
  revalidatePath('/domicilios')

  const res = (r ?? {}) as { cobros?: number; recogido?: number }
  return { ok: true, cobros: res.cobros ?? 0, recogido: res.recogido ?? 0 }
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
