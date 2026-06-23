'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CategoriaGasto, Gasto } from '@/types'

export type GastoInput = {
  fecha: string
  valor: number
  categoria: CategoriaGasto
  sede_id: string
  cuenta_id: string | null
  observacion: string
}

export type GastoResult = { ok: true; id: string } | { ok: false; error: string }

export async function crearGastoAction(data: GastoInput): Promise<GastoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      fecha:          data.fecha,
      valor:          data.valor,
      categoria:      data.categoria,
      sede_id:        data.sede_id,
      cuenta_id:      data.cuenta_id || null,
      responsable_id: user.id,
      observacion:    data.observacion.trim() || null,
      origen:         'manual',
    })
    .select('id')
    .single()

  if (error || !gasto) return { ok: false, error: error?.message ?? 'Error creando gasto' }

  revalidatePath('/gastos')
  revalidatePath('/flujo-caja')
  return { ok: true, id: gasto.id }
}

export type GastosFiltros = {
  desde: string
  hasta: string
  categoria?: CategoriaGasto
  sede_id?: string
}

export async function getGastosAction(filtros: GastosFiltros): Promise<Gasto[]> {
  const supabase = await createClient()

  let q = supabase
    .from('gastos')
    .select('*, sede:sedes(codigo,nombre), cuenta:cuentas(nombre,tipo), responsable:usuarios(nombre)')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(500)

  if (filtros.categoria) q = q.eq('categoria', filtros.categoria)
  if (filtros.sede_id)   q = q.eq('sede_id', filtros.sede_id)

  const { data } = await q
  return (data ?? []) as Gasto[]
}

export type EliminarGastoResult = { ok: true } | { ok: false; error: string }

export async function eliminarGastoAction(id: string): Promise<EliminarGastoResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios').select('rol').eq('id', user.id).single()
  if (usuario?.rol !== 'admin') return { ok: false, error: 'Solo administradores' }

  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/gastos')
  revalidatePath('/flujo-caja')
  return { ok: true }
}

// ─── Reportes financieros ───────────────────────────────────────────────────

export type SaldoCuenta = {
  id: string
  nombre: string
  tipo: 'banco' | 'efectivo' | 'billetera'
  sede_codigo: string | null
  total_ingresos: number
  total_egresos: number
  saldo_neto: number
}

export async function getSaldosCuentasAction(): Promise<SaldoCuenta[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saldos_cuentas')
    .select('*')
    .order('nombre')
  return (data ?? []) as SaldoCuenta[]
}

export type FlujoDia = {
  fecha: string
  cuenta_id: string
  cuenta_nombre: string
  tipo: 'banco' | 'efectivo' | 'billetera'
  ingresos_hoy: number
  egresos_hoy: number
  neto_hoy: number
}

export async function getFlujoDiaAction(): Promise<FlujoDia[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('flujo_caja_diario')
    .select('*')
    .order('cuenta_nombre')
  return (data ?? []) as FlujoDia[]
}

export type VentaDia = {
  fecha: string
  sede_id: string
  sede_codigo: string
  sede_nombre: string
  num_facturas: number
  total_facturado: number
  total_recaudado: number
  saldo_pendiente: number
}

export async function getVentasDiaAction(): Promise<VentaDia[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ventas_diarias_sede')
    .select('*')
    .order('sede_codigo')
  return (data ?? []) as VentaDia[]
}

// ─── Mensajerías ────────────────────────────────────────────────────────────

export type DeudaMensajeria = {
  mensajeria: string
  domicilios_pendientes: number
  deuda_acumulada: number
  pagado_acumulado: number
  saldo_pendiente: number
  total_movimiento: number
}

export async function getDeudaMensajeriasAction(): Promise<DeudaMensajeria[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('mensajeria_deuda')
    .select('*')
    .order('mensajeria')
  return (data ?? []) as DeudaMensajeria[]
}

export type DomicilioDeudaPendiente = {
  id: string
  numero: string
  mensajeria: string
  valor_domicilio: number
  tipo_cobro: string
  estado: string
  pendiente_mensajeria: boolean
  numero_orden: string
  cliente_nombre: string
  cliente_telefono: string
  creado_en: string
  deuda_total: number
  pagado_total: number
}

export async function getDomiciliosDeudaPendienteAction(): Promise<DomicilioDeudaPendiente[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('domicilios_deuda_pendiente')
    .select('*')
    .order('creado_en', { ascending: false })
  return (data ?? []) as DomicilioDeudaPendiente[]
}
