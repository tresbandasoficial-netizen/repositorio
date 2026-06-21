import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { MetodoPago, METODOS_PAGO } from '@/types'

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
  desde: string          // YYYY-MM-DD
  hasta: string          // YYYY-MM-DD
  sede?: string          // sede_codigo; vacío = consolidado (todas)
  asesor_id?: string
}

export type FilaMetodo = {
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
  porMetodo: FilaMetodo[]
  porAsesor: FilaAsesor[]
  porSede: FilaSede[]
  totalVenta: number
  totalAbono: number
  totalCartera: number
  totalGeneral: number
  registros: number
}

export async function getCuadre(filtros: CuadreFiltros): Promise<Cuadre> {
  const supabase = await createClient()
  const sesion = await getSesion()

  let query = supabase
    .from('vista_pagos_unificados')
    .select('*')
    .gte('fecha', filtros.desde)
    .lte('fecha', filtros.hasta)
    .limit(10000)

  // RLS lógica: el asesor solo ve su sede.
  if (sesion.rol !== 'admin' && sesion.sede_id) {
    query = query.eq('sede_id', sesion.sede_id)
  } else if (filtros.sede) {
    query = query.eq('sede_codigo', filtros.sede)
  }

  if (filtros.asesor_id) query = query.eq('asesor_id', filtros.asesor_id)

  const { data, error } = await query
  if (error) throw new Error(`Error cargando cuadre: ${error.message}`)

  const rows = (data ?? []) as PagoUnificado[]

  // Agrupar por método
  const metodoMap = new Map<MetodoPago, FilaMetodo>()
  for (const m of METODOS_PAGO) metodoMap.set(m, { metodo: m, venta: 0, abono: 0, cartera: 0, total: 0 })

  const asesorMap = new Map<string, FilaAsesor>()
  const sedeMap = new Map<string, FilaSede>()
  let totalVenta = 0, totalAbono = 0, totalCartera = 0

  for (const r of rows) {
    const fm = metodoMap.get(r.metodo) ?? { metodo: r.metodo, venta: 0, abono: 0, cartera: 0, total: 0 }
    fm[r.origen] += r.monto
    fm.total += r.monto
    metodoMap.set(r.metodo, fm)

    let fa = asesorMap.get(r.asesor_id)
    if (!fa) { fa = { asesor_id: r.asesor_id, asesor_nombre: r.asesor_nombre, venta: 0, abono: 0, cartera: 0, total: 0 }; asesorMap.set(r.asesor_id, fa) }
    fa[r.origen] += r.monto
    fa.total += r.monto

    let fs = sedeMap.get(r.sede_codigo)
    if (!fs) { fs = { sede_codigo: r.sede_codigo, sede_nombre: r.sede_nombre, total: 0 }; sedeMap.set(r.sede_codigo, fs) }
    fs.total += r.monto

    if (r.origen === 'venta') totalVenta += r.monto
    else if (r.origen === 'abono') totalAbono += r.monto
    else totalCartera += r.monto
  }

  const porMetodo = [...metodoMap.values()].filter(f => f.total > 0)
  const porAsesor = [...asesorMap.values()].sort((a, b) => b.total - a.total)
  const porSede = [...sedeMap.values()].sort((a, b) => b.total - a.total)

  return {
    filtros,
    porMetodo,
    porAsesor,
    porSede,
    totalVenta,
    totalAbono,
    totalCartera,
    totalGeneral: totalVenta + totalAbono + totalCartera,
    registros: rows.length,
  }
}
