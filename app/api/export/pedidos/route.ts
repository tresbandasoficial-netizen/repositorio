import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ESTADO_LABELS } from '@/types'

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
  otro: 'Otro',
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('No autorizado', { status: 401 })
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario) return new Response('No autorizado', { status: 401 })

  const url = request.nextUrl
  const q       = url.searchParams.get('q')      || undefined
  const estado  = url.searchParams.get('estado') || undefined
  const sede    = url.searchParams.get('sede')   || undefined
  const alerta  = url.searchParams.get('alerta') === '1'

  let query = supabase
    .from('vista_pedidos_asesor')
    .select('numero_orden, estado, cliente_nombre, cliente_telefono, sede_codigo, asesor_nombre, total, total_pagado, tipo_entrega, direccion_entrega, numero_guia, fecha_creacion, en_alerta')
    .order('fecha_creacion', { ascending: false })
    .limit(5000)

  if (estado)           query = query.eq('estado', estado)
  if (usuario.rol === 'admin' && sede) query = query.eq('sede_codigo', sede)
  if (alerta)           query = query.eq('en_alerta', true)
  if (q) {
    query = query.or(
      `numero_orden.ilike.%${q}%,cliente_nombre.ilike.%${q}%,cliente_telefono.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) return new Response('Error al exportar', { status: 500 })

  const rows = data ?? []

  const headers = [
    'Orden', 'Estado', 'Alerta', 'Cliente', 'Teléfono', 'Sede', 'Asesor',
    'Total', 'Pagado', 'Saldo', 'Entrega', 'Dirección', 'Guía', 'Fecha',
  ]

  const lines: string[] = [headers.join(',')]
  for (const r of rows) {
    const saldo = r.total - r.total_pagado
    lines.push([
      csvCell(r.numero_orden),
      csvCell(ESTADO_LABELS[r.estado as keyof typeof ESTADO_LABELS] ?? r.estado),
      csvCell(r.en_alerta ? 'Sí' : 'No'),
      csvCell(r.cliente_nombre),
      csvCell(r.cliente_telefono),
      csvCell(r.sede_codigo),
      csvCell(r.asesor_nombre),
      csvCell(r.total),
      csvCell(r.total_pagado),
      csvCell(saldo),
      csvCell(r.tipo_entrega === 'domicilio' ? 'Domicilio' : 'Sede'),
      csvCell(r.direccion_entrega),
      csvCell((r as any).numero_guia),
      csvCell(r.fecha_creacion?.slice(0, 10)),
    ].join(','))
  }

  const csv = '﻿' + lines.join('\n') // BOM for Excel UTF-8
  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-${fecha}.csv"`,
    },
  })
}
