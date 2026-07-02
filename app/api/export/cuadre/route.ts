import { NextRequest } from 'next/server'
import { getCuadre } from '@/lib/queries/cuadre'
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
  lines.push(`Cuadre de caja,${desde} a ${hasta}${sede ? ',Sede:,' + sede : ',Sede:,Todas'}`)
  lines.push('')

  // Resumen general
  lines.push('RESUMEN GENERAL')
  lines.push(['Vendido', fmt(cuadre.totalVendido)].join(','))
  lines.push(['Recaudado en caja', fmt(cuadre.totalRecaudadoCaja)].join(','))
  lines.push(['Por cobrar mensajería', fmt(cuadre.totalPorCobrarMensajeria)].join(','))
  lines.push(['A crédito', fmt(cuadre.totalCredito)].join(','))
  lines.push(['Gastos', fmt(cuadre.totalGastos)].join(','))
  lines.push(['Neto en caja', fmt(cuadre.totalNetoCaja)].join(','))
  lines.push('')

  // Por sede
  for (const s of cuadre.sedes) {
    lines.push(`SEDE: ${csvCell(`${s.sede_nombre} (${s.sede_codigo})`)}`)
    lines.push(['Vendido', fmt(s.vendido)].join(','))
    lines.push(['Recaudado en caja', fmt(s.recaudadoCaja)].join(','))
    lines.push(['Por cobrar mensajería', fmt(s.porCobrarMensajeria)].join(','))
    lines.push(['A crédito', fmt(s.credito)].join(','))
    lines.push(['Gastos', fmt(s.gastos)].join(','))
    lines.push(['Neto en caja', fmt(s.netoCaja)].join(','))
    lines.push(['Método', 'Recaudado'].join(','))
    for (const m of s.porMetodo) {
      lines.push([csvCell(m.label), fmt(m.monto)].join(','))
    }
    lines.push('')
  }

  // Por asesor
  lines.push('RECAUDO EN CAJA POR ASESOR')
  lines.push(['Asesor', 'Recaudado'].join(','))
  for (const a of cuadre.porAsesor) {
    lines.push([csvCell(a.asesor_nombre), fmt(a.recaudadoCaja)].join(','))
  }

  const csv = '﻿' + lines.join('\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cuadre-${desde}_${hasta}.csv"`,
    },
  })
}
