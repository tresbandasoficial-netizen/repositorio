import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { EntregaEfectivoButton } from '@/components/flujo/EntregaEfectivoButton'
import { AgregarDineroButton } from '@/components/flujo/AgregarDineroButton'

type Cuenta = {
  id: string
  nombre: string
  tipo: string
  sede_id: string | null
  saldo_inicial: number
  fecha_corte: string | null
  orden: number
}

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp     = await searchParams
  const sedeId = sp.sede || null

  const supabase = await createClient()

  const { data: sedes } = await supabase
    .from('sedes')
    .select('id, codigo, nombre')
    .order('codigo')

  const { data: cuentasRaw } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, sede_id, saldo_inicial, fecha_corte, orden')
    .eq('activa', true)
    .neq('tipo', 'credito')   // el crédito no es dinero real
    .order('orden')
  const cuentas = (cuentasRaw ?? []) as Cuenta[]

  // Fecha de corte mínima para acotar la consulta de movimientos.
  const cortes = cuentas.map(c => c.fecha_corte).filter(Boolean) as string[]
  const corteMin = cortes.length ? cortes.sort()[0] : hoyBogota()

  // Movimientos desde el corte (cada cuenta cuenta los suyos desde su fecha_corte).
  // Se excluye crédito (no es dinero) y pagos anulados (pedidos cancelados /
  // facturas anuladas — marcados anulado=true por la migración 076).
  const [pagosRes, pfRes, gastosRes, pmRes, traslRes] = await Promise.all([
    supabase.from('pagos').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_factura').select('cuenta_id, monto, fecha').neq('metodo', 'credito').eq('anulado', false).gte('fecha', corteMin).limit(20000),
    supabase.from('gastos').select('cuenta_id, valor, fecha').gte('fecha', corteMin).limit(20000),
    supabase.from('pagos_mensajeria').select('cuenta_id, monto, fecha, tipo').eq('tipo', 'pago').gte('fecha', corteMin).limit(20000),
    supabase.from('traslados_caja').select('origen_cuenta_id, destino_cuenta_id, monto, fecha').gte('fecha', corteMin).limit(20000),
  ])

  const pagos    = (pagosRes.data  ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const pf       = (pfRes.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const gastos   = (gastosRes.data ?? []) as Array<{ cuenta_id: string | null; valor: number; fecha: string }>
  const pm       = (pmRes.data     ?? []) as Array<{ cuenta_id: string | null; monto: number; fecha: string }>
  const traslados = (traslRes.data ?? []) as Array<{ origen_cuenta_id: string | null; destino_cuenta_id: string; monto: number; fecha: string }>

  // Saldo de cada cuenta = saldo_inicial + (ingresos − egresos) desde su corte.
  type Fila = Cuenta & { ingresos: number; egresos: number; saldo: number }
  const filas: Fila[] = cuentas.map(c => {
    const corte = c.fecha_corte || hoyBogota()
    let ingresos = 0, egresos = 0
    for (const p of pagos)  if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto
    for (const p of pf)     if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto
    for (const p of pm)     if (p.cuenta_id === c.id && p.fecha >= corte) ingresos += p.monto   // liquidaciones de mensajería
    for (const t of traslados) if (t.destino_cuenta_id === c.id && t.fecha >= corte) ingresos += t.monto
    for (const g of gastos) if (g.cuenta_id === c.id && g.fecha >= corte) egresos += g.valor
    for (const t of traslados) if (t.origen_cuenta_id === c.id && t.fecha >= corte) egresos += t.monto
    return { ...c, ingresos, egresos, saldo: c.saldo_inicial + ingresos - egresos }
  })

  // Filtro por sede (según la sede de la cuenta).
  const visibles = (sedeId ? filas.filter(f => f.sede_id === sedeId) : filas)
    .filter(f => f.saldo !== 0 || f.ingresos !== 0 || f.egresos !== 0 || f.saldo_inicial !== 0)

  const efectivo = visibles.filter(f => f.tipo === 'efectivo')
  const otras    = visibles.filter(f => f.tipo !== 'efectivo')

  const totalEfectivo = efectivo.reduce((s, f) => s + f.saldo, 0)
  const totalCuentas  = otras.reduce((s, f) => s + f.saldo, 0)
  const totalGeneral  = totalEfectivo + totalCuentas

  const sedeActual = sedes?.find(s => s.id === sedeId)
  const corteLabel = cortes.length ? formatFecha(corteMin) : '—'

  // Cuentas para el selector de "Entrega de efectivo".
  const cuentasOpc = cuentas.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))

  function tabUrl(sid: string | null) {
    return sid ? `/flujo-caja?sede=${sid}` : '/flujo-caja'
  }

  const renderTabla = (titulo: string, filas: Fila[], total: number) => {
    if (filas.length === 0) return null
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <p className="text-sm font-bold text-gray-900">{formatCOP(total)}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="text-left px-5 py-2">Cuenta</th>
              <th className="text-right px-3 py-2">Saldo inicial</th>
              <th className="text-right px-3 py-2">Ingresos</th>
              <th className="text-right px-3 py-2">Egresos</th>
              <th className="text-right px-5 py-2">Saldo actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map(f => (
              <tr key={f.id}>
                <td className="px-5 py-2.5 text-gray-800">{f.nombre}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{formatCOP(f.saldo_inicial)}</td>
                <td className="px-3 py-2.5 text-right text-green-700">{f.ingresos ? '+' + formatCOP(f.ingresos) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-red-600">{f.egresos ? '−' + formatCOP(f.egresos) : '—'}</td>
                <td className="px-5 py-2.5 text-right font-bold text-gray-900">{formatCOP(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flujo de caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sedeActual ? sedeActual.nombre : 'Todas las sedes'} · saldos desde el corte ({corteLabel})
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <AgregarDineroButton cuentas={cuentasOpc} />
          <EntregaEfectivoButton cuentas={cuentasOpc} />
        </div>
      </div>

      {/* Tabs de sede */}
      <div className="flex gap-2 flex-wrap">
        <Link href={tabUrl(null)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !sedeId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}>
          Todas
        </Link>
        {(sedes ?? []).map(s => (
          <Link key={s.id} href={tabUrl(s.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              sedeId === s.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>
            {s.nombre}
          </Link>
        ))}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 uppercase">Efectivo</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCOP(totalEfectivo)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 uppercase">Cuentas</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCOP(totalCuentas)}</p>
        </div>
        <div className="rounded-xl p-5 bg-blue-600">
          <p className="text-xs uppercase text-blue-100">Total</p>
          <p className="text-2xl font-bold text-white mt-2">{formatCOP(totalGeneral)}</p>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No hay cuentas con saldo{sedeActual ? ` en ${sedeActual.codigo}` : ''}.
        </div>
      ) : (
        <div className="space-y-4">
          {renderTabla('Efectivo', efectivo, totalEfectivo)}
          {renderTabla('Cuentas', otras, totalCuentas)}
        </div>
      )}
    </div>
  )
}
