import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago, METODO_PAGO_LABELS } from '@/types'

export type OrigenPago = 'venta' | 'abono' | 'cartera'

export type PagoUnificado = {
  id: string
  fecha: string
  monto: number
  metodo: MetodoPago
  asesor_id: string
  asesor_nombre: string
  sede_id: string
  sede_codigo: string
  sede_nombre: string
  origen: OrigenPago
  referencia: string
}

export type CuadreFiltros = {
  desde: string
  hasta: string
  sede?: string
  asesor_id?: string
}

// Agrupa por "cuenta" (combina efectivo+sede para diferenciar cajas)
export type FilaCuenta = {
  label: string   // 'Caja Bucaramanga' | 'Nequi Johan' | etc.
  metodo: MetodoPago
  venta: number
  abono: number
  cartera: number
  total: number
}

export type FilaAsesor = {
  asesor_id: string
  asesor_nombre: string
  venta: number
  abono: number
  cartera: number
  total: number
}

export type FilaSede = {
  sede_codigo: string
  sede_nombre: string
  total: number
}

export type Cuadre = {
  filtros: CuadreFiltros
  porCuenta: FilaCuenta[]
  porAsesor: FilaAsesor[]
  porSede: FilaSede[]
  totalVenta: number
  totalAbono: number
  totalCartera: number
  totalGeneral: number
  registros: number
}

const CAJA_LABELS: Record<string, string> = {
  TR: 'Caja Bucaramanga',
  CR: 'Caja Cúcuta',
  SR: 'Caja Santa Rosa',
}

function getCuentaLabel(r: PagoUnificado): string {
  if (r.metodo === 'efectivo') {
    return CAJA_LABELS[r.sede_codigo] ?? `Caja ${r.sede_nombre}`
  }
  return METODO_PAGO_LABELS[r.metodo] ?? r.metodo
}

export async function getCuadre(filtros: CuadreFiltros): Promise<Cuadre> {
  const supabase = await createClient()
  const sesion = await getSesion()

  let query = supabase
    .from('vista_pagos_unificados')
    .select('*')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .neq('metodo', 'credito')
    .limit(10000)

  if (sesion.rol !== 'admin' && sesion.sede_id) {
    query = query.eq('sede_id', sesion.sede_id)
  } else if (filtros.sede) {
    query = query.eq('sede_codigo', filtros.sede)
  }

  if (filtros.asesor_id) query = query.eq('asesor_id', filtros.asesor_id)

  const { data, error } = await query
  if (error) throw new Error(`Error cargando cuadre: ${error.message}`)

  const rows = (data ?? []) as PagoUnificado[]

  const cuentaMap = new Map<string, FilaCuenta>()
  const asesorMap = new Map<string, FilaAsesor>()
  const sedeMap   = new Map<string, FilaSede>()
  let totalVenta = 0, totalAbono = 0, totalCartera = 0

  for (const r of rows) {
    const key   = getCuentaLabel(r)
    let fc = cuentaMap.get(key) ?? { label: key, metodo: r.metodo, venta: 0, abono: 0, cartera: 0, total: 0 }
    fc[r.origen] += r.monto
    fc.total     += r.monto
    cuentaMap.set(key, fc)

    let fa = asesorMap.get(r.asesor_id)
    if (!fa) { fa = { asesor_id: r.asesor_id, asesor_nombre: r.asesor_nombre, venta: 0, abono: 0, cartera: 0, total: 0 }; asesorMap.set(r.asesor_id, fa) }
    fa[r.origen] += r.monto
    fa.total     += r.monto

    let fs = sedeMap.get(r.sede_codigo)
    if (!fs) { fs = { sede_codigo: r.sede_codigo, sede_nombre: r.sede_nombre, total: 0 }; sedeMap.set(r.sede_codigo, fs) }
    fs.total += r.monto

    if (r.origen === 'venta')         totalVenta   += r.monto
    else if (r.origen === 'abono')    totalAbono   += r.monto
    else                              totalCartera  += r.monto
  }

  const porCuenta = [...cuentaMap.values()].sort((a, b) => b.total - a.total)
  const porAsesor = [...asesorMap.values()].sort((a, b) => b.total - a.total)
  const porSede   = [...sedeMap.values()].sort((a, b) => b.total - a.total)

  return {
    filtros,
    porCuenta,
    porAsesor,
    porSede,
    totalVenta,
    totalAbono,
    totalCartera,
    totalGeneral: totalVenta + totalAbono + totalCartera,
    registros: rows.length,
  }
}
