import { NextRequest } from 'next/server'
import { getCuadre } from '@/lib/queries/cuadre'
import { METODO_PAGO_LABELS, MetodoPago } from '@/types'
import { createClient } from '@/lib/supabase/server'

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

const fmt = (n: number) => n.toLocaleString('es-CO')

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })

  const url = request.nextUrl
  const desde = url.searchParams.get('desde') || new Date().toISOString().slice(0, 10)
  const hasta = url.searchParams.get('hasta') || desde
  const sede = url.searchParams.get('sede') || undefined

  let cuadre
  try {
    cuadre = await getCuadre({ desde, hasta, sede })
  } catch {
    return new Response('Error al exportar', { status: 500 })
  }

  const lines: string[] = []
  lines.push(`Cuadre de caja,${desde} a ${hasta}${sede ? ',Sede:,' + sede : ',Sede:,Consolidado'}`)
  lines.push('')

  // Por cuenta
  lines.push('POR CUENTA')
  lines.push(['Cuenta', 'Ventas', 'Abonos', 'Cartera', 'Total'].join(','))
  for (const c of cuadre.porCuenta) {
    lines.push([
      csvCell(c.label),
      fmt(c.venta), fmt(c.abono), fmt(c.cartera), fmt(c.total),
    ].join(','))
  }
  lines.push(['Total', fmt(cuadre.totalVenta), fmt(cuadre.totalAbono), fmt(cuadre.totalCartera), fmt(cuadre.totalGeneral)].join(','))
  lines.push('')

  // Por asesor
  lines.push('POR ASESOR')
  lines.push(['Asesor', 'Ventas', 'Abonos', 'Cartera', 'Total'].join(','))
  for (const a of cuadre.porAsesor) {
    lines.push([csvCell(a.asesor_nombre), fmt(a.venta), fmt(a.abono), fmt(a.cartera), fmt(a.total)].join(','))
  }
  lines.push('')

  // Por sede
  if (cuadre.porSede.length > 1) {
    lines.push('CONSOLIDADO POR SEDE')
    lines.push(['Sede', 'Total'].join(','))
    for (const s of cuadre.porSede) {
      lines.push([csvCell(`${s.sede_nombre} (${s.sede_codigo})`), fmt(s.total)].join(','))
    }
    lines.push('')
  }

  lines.push(['TOTAL RECAUDADO', fmt(cuadre.totalGeneral)].join(','))

  const csv = '﻿' + lines.join('\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cuadre-${desde}_${hasta}.csv"`,
    },
  })
}
