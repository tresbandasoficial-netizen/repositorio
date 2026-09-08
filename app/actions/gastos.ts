'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { bloqueoCajaCerrada } from '@/lib/auth/caja'
import { CategoriaGasto, Gasto } from '@/types'
import { hoyBogota } from '@/lib/utils/format'

// ─── Gasto CRUD ───────────────────────────────────────────────────────────────

export type GastoInput = {
  fecha: string
  valor: number
  categoria: CategoriaGasto
  sede_id: string
  cuenta_id: string | null
  observacion: string
  // "Este gasto ES el pago de un gasto fijo del mes" (mig. 190, solo admin):
  // al guardarlo, el fijo queda marcado como pagado en /gastos-fijos.
  gasto_fijo_id?: string | null
}

export type GastoResult = { ok: true; id: string } | { ok: false; error: string }

// Marca (o desmarca) el mes del fijo en gastos_fijos_pagos según la fecha del
// gasto. El desmarque solo borra el check si NINGÚN otro gasto del mes sigue
// vinculado a ese fijo.
async function _sincronizarPagoFijo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gastoFijoId: string,
  fechaGasto: string,
  usuarioId: string,
  vincular: boolean,
) {
  const mes = fechaGasto.slice(0, 8) + '01'
  if (vincular) {
    await supabase.from('gastos_fijos_pagos').upsert(
      { gasto_fijo_id: gastoFijoId, mes, usuario_id: usuarioId },
      { onConflict: 'gasto_fijo_id,mes' },
    )
  } else {
    const [y, m] = mes.split('-').map(Number)
    const mesSiguiente = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
    const { data: otros } = await supabase
      .from('gastos')
      .select('id')
      .eq('gasto_fijo_id', gastoFijoId)
      .gte('fecha', mes)
      .lt('fecha', mesSiguiente)
      .limit(1)
    if (!otros || otros.length === 0) {
      await supabase.from('gastos_fijos_pagos').delete()
        .eq('gasto_fijo_id', gastoFijoId).eq('mes', mes)
    }
  }
  revalidatePath('/gastos-fijos')
}

export async function crearGastoAction(data: GastoInput): Promise<GastoResult> {
  if (data.valor <= 0) return { ok: false, error: 'El valor debe ser mayor a cero' }
  if (!data.cuenta_id)
    return { ok: false, error: 'Selecciona la cuenta con la que se pagó el gasto (efectivo, Nequi, Bancolombia…)' }

  const sesion = await getSesion()
  if (sesion.rol === 'visor') return { ok: false, error: 'Sin permisos para crear gastos' }
  if (sesion.rol !== 'admin' && data.categoria === 'compras_mercancia')
    return { ok: false, error: 'Solo un administrador puede registrar compras de mercancía' }
  const bloqueo = await bloqueoCajaCerrada(sesion)
  if (bloqueo) return { ok: false, error: bloqueo }
  const supabase = await createClient()

  // El asesor solo puede registrar gastos en su propia sede; el admin elige.
  const sedeId = sesion.rol === 'admin' ? data.sede_id : sesion.sede_id
  if (!sedeId) return { ok: false, error: 'Selecciona una sede para el gasto' }

  // El vínculo con un gasto fijo es solo del admin (la lista de fijos
  // contiene sueldos y no se muestra a asesores).
  const gastoFijoId = sesion.rol === 'admin' ? (data.gasto_fijo_id || null) : null

  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      fecha:          data.fecha,
      valor:          data.valor,
      categoria:      data.categoria,
      sede_id:        sedeId,
      cuenta_id:      data.cuenta_id,
      responsable_id: sesion.id,
      observacion:    data.observacion.trim() || null,
      origen:         'manual',
      gasto_fijo_id:  gastoFijoId,
    })
    .select('id')
    .single()

  if (error || !gasto) return { ok: false, error: error?.message ?? 'Error creando gasto' }

  if (gastoFijoId) {
    await _sincronizarPagoFijo(supabase, gastoFijoId, data.fecha, sesion.id, true)
  }

  revalidatePath('/gastos')
  revalidatePath('/flujo-caja')
  return { ok: true, id: gasto.id }
}

// Vincula (o desvincula, con gastoFijoId = null) un gasto YA registrado con
// un gasto fijo, y deja el check del mes en /gastos-fijos acorde.
export async function vincularGastoFijoAction(
  gastoId: string,
  gastoFijoId: string | null,
): Promise<GastoResult> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return { ok: false, error: 'Solo administradores' }
  const supabase = await createClient()

  const { data: gasto, error: errGasto } = await supabase
    .from('gastos')
    .select('id, fecha, gasto_fijo_id')
    .eq('id', gastoId)
    .maybeSingle()
  if (errGasto) return { ok: false, error: errGasto.message }
  if (!gasto) return { ok: false, error: 'Gasto no encontrado' }

  const { error } = await supabase
    .from('gastos')
    .update({ gasto_fijo_id: gastoFijoId })
    .eq('id', gastoId)
  if (error) return { ok: false, error: error.message }

  // Si cambió de fijo, el anterior pierde este respaldo (y su check si quedó solo).
  if (gasto.gasto_fijo_id && gasto.gasto_fijo_id !== gastoFijoId) {
    await _sincronizarPagoFijo(supabase, gasto.gasto_fijo_id, gasto.fecha, sesion.id, false)
  }
  if (gastoFijoId) {
    await _sincronizarPagoFijo(supabase, gastoFijoId, gasto.fecha, sesion.id, true)
  }

  revalidatePath('/gastos')
  return { ok: true, id: gastoId }
}

export type GastosFiltros = {
  desde: string
  hasta: string
  categoria?: CategoriaGasto
  sede_id?: string
}

export async function getGastosAction(filtros: GastosFiltros): Promise<Gasto[]> {
  const sesion = await getSesion()
  const supabase = await createClient()

  let q = supabase
    .from('gastos')
    .select('*, sede:sedes(codigo,nombre), cuenta:cuentas(nombre,tipo), responsable:usuarios(nombre)')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(500)

  // Los costos de compra de mercancía son información solo de admin.
  if (sesion.rol !== 'admin') q = q.neq('categoria', 'compras_mercancia')

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

// ─── Financial dashboard views ────────────────────────────────────────────────

export type SaldoCuenta = {
  id: string
  nombre: string
  tipo: string
  sede_codigo: string
  total_ingresos: number
  total_egresos: number
  saldo_neto: number
}

export type FlujoDia = {
  fecha: string
  cuenta_id: string
  cuenta_nombre: string
  tipo: string
  ingresos_hoy: number
  egresos_hoy: number
  neto_hoy: number
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

export type DeudaMensajeria = {
  mensajeria: string
  domicilios_pendientes: number
  deuda_acumulada: number
  pagado_acumulado: number
  saldo_pendiente: number
  total_movimiento: number
}

export type DomicilioDeudaPendiente = {
  id: string
  mensajeria: string
  valor_domicilio: number
  tipo_cobro: string
  estado: string
  pendiente_mensajeria: boolean
  numero_pedido: string
  numero_orden: string
  cliente_nombre: string
  telefono_normalizado: string
  creado_en: string
  deuda_total: number
  pagado_total: number
}

export async function getSaldosCuentasAction(): Promise<SaldoCuenta[]> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return []
  const supabase = await createClient()
  const { data } = await supabase.from('saldos_cuentas').select('*')
  return (data ?? []) as SaldoCuenta[]
}

export async function getFlujoDiaAction(sedeId?: string): Promise<FlujoDia[]> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') return []
  const supabase = await createClient()
  const hoy = hoyBogota()

  // El asesor queda amarrado a SU sede; el admin usa la sede que eligió en el
  // modal. Así el cierre de Bucaramanga nunca muestra cuentas de otra sede
  // (ej. Efectivo Santa Rosa) ni cuentas globales que mezclan varias sedes.
  const sid = sesion.rol === 'admin' ? (sedeId || null) : sesion.sede_id

  let q = supabase.from('flujo_caja_diario').select('*').eq('fecha', hoy)
  if (sid) q = q.eq('sede_id', sid)
  const { data } = await q
  return (data ?? []) as FlujoDia[]
}

export async function getVentasDiaAction(): Promise<VentaDia[]> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return []
  const supabase = await createClient()
  const hoy = hoyBogota()
  const { data } = await supabase
    .from('ventas_diarias_sede')
    .select('*')
    .eq('fecha', hoy)
  return (data ?? []) as VentaDia[]
}

export async function getDeudaMensajeriasAction(): Promise<DeudaMensajeria[]> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('mensajeria_deuda')
    .select('*')
    .order('saldo_pendiente', { ascending: false })
  return (data ?? []) as DeudaMensajeria[]
}

export async function getDomiciliosDeudaPendienteAction(): Promise<DomicilioDeudaPendiente[]> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('domicilios_deuda_pendiente')
    .select('*')
    .order('creado_en', { ascending: false })
  return (data ?? []) as DomicilioDeudaPendiente[]
}
