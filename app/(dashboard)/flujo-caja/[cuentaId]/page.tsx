import { notFound, redirect } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, formatHora, hoyBogota } from '@/lib/utils/format'
import { CATEGORIA_GASTO_LABELS, CategoriaGasto } from '@/types'

type Movimiento = {
  fecha: string
  creado_en: string
  tipo: string
  detalle: string
  ingreso: number
  egreso: number
  // Los cuadres son informativos: la diferencia ya quedó absorbida en el
  // saldo_inicial del corte, así que no suman al saldo (evita doble conteo).
  esAjuste?: boolean
}

export default async function CuentaMovimientosPage({
  params,
}: {
  params: Promise<{ cuentaId: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const { cuentaId } = await params
  const supabase = await createClient()

  const { data: cuenta } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, saldo_inicial, fecha_corte, sede:sedes(codigo, nombre)')
    .eq('id', cuentaId)
    .single()
  if (!cuenta) notFound()

  const { data: cuentasRaw } = await supabase.from('cuentas').select('id, nombre')
  const nombrePorId = new Map((cuentasRaw ?? []).map(c => [c.id as string, c.nombre as string]))

  const [pagosR, pfR, pmR, trR, gastosR] = await Promise.all([
    supabase.from('pagos')
      .select('fecha, monto, creado_en, pedido:pedidos(numero_orden)')
      .eq('cuenta_id', cuentaId).eq('anulado', false).neq('metodo', 'credito')
      .limit(5000),
    supabase.from('pagos_factura')
      .select('fecha, monto, creado_en, factura:facturas(numero_factura)')
      .eq('cuenta_id', cuentaId).eq('anulado', false).neq('metodo', 'credito')
      .limit(5000),
    supabase.from('pagos_mensajeria')
      .select('fecha, monto, creado_en, mensajeria, notas')
      .eq('cuenta_id', cuentaId).eq('tipo', 'pago')
      .limit(5000),
    supabase.from('traslados_caja')
      .select('fecha, monto, creado_en, origen_cuenta_id, destino_cuenta_id, notas')
      .or(`origen_cuenta_id.eq.${cuentaId},destino_cuenta_id.eq.${cuentaId}`)
      .limit(5000),
    supabase.from('gastos')
      .select('fecha, valor, creado_en, categoria, observacion')
      .eq('cuenta_id', cuentaId)
      .limit(5000),
  ])

  const { data: ajustesR } = await supabase
    .from('ajustes_caja')
    .select('fecha, creado_en, diferencia, saldo_contado, motivo')
    .eq('cuenta_id', cuentaId)
    .limit(500)

  const movimientos: Movimiento[] = []

  for (const p of (pagosR.data ?? []) as any[]) {
    const pedido = Array.isArray(p.pedido) ? p.pedido[0] : p.pedido
    movimientos.push({
      fecha: p.fecha, creado_en: p.creado_en,
      tipo: 'Abono pedido',
      detalle: pedido?.numero_orden ?? '',
      ingreso: p.monto, egreso: 0,
    })
  }
  for (const p of (pfR.data ?? []) as any[]) {
    const factura = Array.isArray(p.factura) ? p.factura[0] : p.factura
    movimientos.push({
      fecha: p.fecha, creado_en: p.creado_en,
      tipo: 'Pago factura',
      detalle: factura?.numero_factura ?? '',
      ingreso: p.monto, egreso: 0,
    })
  }
  for (const p of (pmR.data ?? []) as any[]) {
    movimientos.push({
      fecha: p.fecha, creado_en: p.creado_en,
      tipo: 'Liquidación mensajería',
      detalle: [p.mensajeria, p.notas].filter(Boolean).join(' · '),
      ingreso: p.monto, egreso: 0,
    })
  }
  for (const t of (trR.data ?? []) as any[]) {
    const entra = t.destino_cuenta_id === cuentaId
    const otra = entra ? nombrePorId.get(t.origen_cuenta_id) : nombrePorId.get(t.destino_cuenta_id)
    movimientos.push({
      fecha: t.fecha, creado_en: t.creado_en,
      tipo: entra ? 'Traslado recibido' : 'Traslado enviado',
      detalle: [otra ? (entra ? `desde ${otra}` : `hacia ${otra}`) : '', t.notas].filter(Boolean).join(' · '),
      ingreso: entra ? t.monto : 0,
      egreso: entra ? 0 : t.monto,
    })
  }
  for (const g of (gastosR.data ?? []) as any[]) {
    movimientos.push({
      fecha: g.fecha, creado_en: g.creado_en,
      tipo: `Gasto · ${CATEGORIA_GASTO_LABELS[g.categoria as CategoriaGasto] ?? g.categoria}`,
      detalle: g.observacion ?? '',
      ingreso: 0, egreso: g.valor,
    })
  }
  for (const a of (ajustesR ?? []) as any[]) {
    const dif = a.diferencia as number
    movimientos.push({
      fecha: a.fecha, creado_en: a.creado_en,
      tipo: 'Cuadre de caja',
      detalle: `${a.motivo ?? 'Ajuste'} · saldo contado ${formatCOP(a.saldo_contado)} · diferencia ${dif >= 0 ? '+' : '−'}${formatCOP(Math.abs(dif))}`,
      ingreso: 0, egreso: 0,
      esAjuste: true,
    })
  }

  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en))

  // Saldo actual = saldo_inicial + movimientos desde el corte (igual que el listado).
  const corte = (cuenta as any).fecha_corte || hoyBogota()
  let ingresosCorte = 0, egresosCorte = 0
  for (const m of movimientos) {
    if (m.fecha >= corte) { ingresosCorte += m.ingreso; egresosCorte += m.egreso }
  }
  const saldoActual = ((cuenta as any).saldo_inicial as number) + ingresosCorte - egresosCorte

  const sede = Array.isArray((cuenta as any).sede) ? (cuenta as any).sede[0] : (cuenta as any).sede

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <BotonVolver href="/flujo-caja">Flujo de caja</BotonVolver>
        <h1 className="text-xl font-bold text-gray-900 mt-2">
          {(cuenta as any).nombre}
          {sede && <span className="text-sm font-normal text-gray-400 ml-2">({sede.nombre})</span>}
        </h1>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Saldo inicial</p>
          <p className="text-base font-bold text-gray-900 mt-1">{formatCOP((cuenta as any).saldo_inicial)}</p>
          {(cuenta as any).fecha_corte && (
            <p className="text-xs text-gray-400 mt-0.5">corte {formatFecha((cuenta as any).fecha_corte)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Ingresos</p>
          <p className="text-base font-bold text-green-700 mt-1">+{formatCOP(ingresosCorte)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Egresos</p>
          <p className="text-base font-bold text-red-600 mt-1">−{formatCOP(egresosCorte)}</p>
        </div>
        <div className="rounded-xl p-4 bg-blue-600">
          <p className="text-xs uppercase text-blue-100">Saldo actual</p>
          <p className="text-base font-bold text-white mt-1">{formatCOP(saldoActual)}</p>
        </div>
      </div>

      {/* Movimientos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Movimientos ({movimientos.length})</p>
          {(cuenta as any).fecha_corte && (
            <p className="text-xs text-gray-400 mt-0.5">
              Los movimientos anteriores al corte ({formatFecha((cuenta as any).fecha_corte)}) ya están incluidos en el saldo inicial.
            </p>
          )}
        </div>
        {movimientos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Esta cuenta no tiene movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Movimiento</th>
                  <th className="text-left px-3 py-2">Detalle</th>
                  <th className="text-right px-3 py-2">Ingreso</th>
                  <th className="text-right px-5 py-2">Egreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movimientos.map((m, i) => {
                  const antesDeCorte = m.fecha < corte && !m.esAjuste
                  return (
                    <tr key={i} className={m.esAjuste ? 'bg-amber-50/70 hover:bg-amber-50' : antesDeCorte ? 'opacity-45' : 'hover:bg-gray-50'}>
                      <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatFecha(m.fecha)}
                        <span className="block text-xs text-gray-400">{formatHora(m.creado_en)}</span>
                      </td>
                      <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${m.esAjuste ? 'text-amber-800' : 'text-gray-800'}`}>
                        {m.esAjuste ? '⚖ ' : ''}{m.tipo}
                      </td>
                      <td className={`px-3 py-2.5 max-w-md ${m.esAjuste ? 'text-amber-800' : 'text-gray-500 truncate max-w-xs'}`}>{m.detalle || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-green-700 whitespace-nowrap">{m.ingreso ? '+' + formatCOP(m.ingreso) : ''}</td>
                      <td className="px-5 py-2.5 text-right text-red-600 whitespace-nowrap">{m.egreso ? '−' + formatCOP(m.egreso) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
