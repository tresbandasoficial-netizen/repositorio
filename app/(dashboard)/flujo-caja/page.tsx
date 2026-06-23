import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP } from '@/lib/utils/format'

function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoy() { return new Date().toISOString().slice(0, 10) }

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sede?: string }>
}) {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const sp     = await searchParams
  const desde  = sp.desde || inicioMes()
  const hasta  = sp.hasta || hoy()
  const sedeId = sp.sede  || null

  const supabase = await createClient()

  // Sedes disponibles para los tabs
  const { data: sedes } = await supabase
    .from('sedes')
    .select('id, codigo, nombre')
    .order('codigo')

  // Ingresos — pagos directos (join pedidos para obtener sede)
  const { data: ingresosRaw } = await supabase
    .from('pagos')
    .select('cuenta_id, monto, metodo, pedidos(sede_id)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .neq('metodo', 'credito')

  // Ingresos — pagos de facturas (join facturas para obtener sede)
  const { data: ingresosFacturaRaw } = await supabase
    .from('pagos_factura')
    .select('cuenta_id, monto, metodo, facturas(sede_id)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .neq('metodo', 'credito')

  // Egresos — gastos (sede_id directo)
  let qGastos = supabase
    .from('gastos')
    .select('cuenta_id, valor')
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (sedeId) qGastos = qGastos.eq('sede_id', sedeId)
  const { data: egresosRaw } = await qGastos

  // Filtrar ingresos por sede (client-side sobre el join)
  const ingresos = sedeId
    ? (ingresosRaw ?? []).filter(p => (p.pedidos as any)?.sede_id === sedeId)
    : (ingresosRaw ?? [])

  const ingresosFactura = sedeId
    ? (ingresosFacturaRaw ?? []).filter(p => (p.facturas as any)?.sede_id === sedeId)
    : (ingresosFacturaRaw ?? [])

  // Cuentas activas
  const { data: cuentas } = await supabase
    .from('cuentas')
    .select('id, nombre, tipo, orden')
    .eq('activa', true)
    .order('orden')

  // Agrupar por cuenta
  const ingresosPorCuenta = new Map<string, number>()
  for (const p of [...ingresos, ...ingresosFactura]) {
    if (!p.cuenta_id) continue
    ingresosPorCuenta.set(p.cuenta_id, (ingresosPorCuenta.get(p.cuenta_id) ?? 0) + p.monto)
  }

  const egresosPorCuenta = new Map<string, number>()
  for (const g of egresosRaw ?? []) {
    if (!g.cuenta_id) continue
    egresosPorCuenta.set(g.cuenta_id, (egresosPorCuenta.get(g.cuenta_id) ?? 0) + g.valor)
  }

  const filas = (cuentas ?? []).map(c => ({
    id:       c.id,
    nombre:   c.nombre,
    tipo:     c.tipo,
    ingresos: ingresosPorCuenta.get(c.id) ?? 0,
    egresos:  egresosPorCuenta.get(c.id) ?? 0,
    neto:     (ingresosPorCuenta.get(c.id) ?? 0) - (egresosPorCuenta.get(c.id) ?? 0),
  })).filter(f => f.ingresos > 0 || f.egresos > 0)

  const totalIngresos = filas.reduce((s, f) => s + f.ingresos, 0)
  const totalEgresos  = filas.reduce((s, f) => s + f.egresos, 0)
  const totalNeto     = totalIngresos - totalEgresos

  const sedeActual = sedes?.find(s => s.id === sedeId)

  function tabUrl(sid: string | null) {
    const base = `/flujo-caja?desde=${desde}&hasta=${hasta}`
    return sid ? `${base}&sede=${sid}` : base
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Flujo de caja</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {sedeActual ? `Sede ${sedeActual.codigo} — ${sedeActual.nombre}` : 'Todas las sedes combinadas'}
        </p>
      </div>

      {/* Tabs de sede */}
      <div className="flex gap-2 flex-wrap">
        <Link href={tabUrl(null)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !sedeId
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}>
          Todas
        </Link>
        {(sedes ?? []).map(s => (
          <Link key={s.id} href={tabUrl(s.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              sedeId === s.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}>
            {s.codigo}
          </Link>
        ))}
      </div>

      {/* Filtros de fecha */}
      <form method="GET" className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
        {sedeId && <input type="hidden" name="sede" value={sedeId} />}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Desde</label>
          <input name="desde" type="date" defaultValue={desde}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Hasta</label>
          <input name="hasta" type="date" defaultValue={hasta}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit"
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          Aplicar
        </button>
      </form>

      {/* Totales generales */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 uppercase">Total ingresos</p>
          <p className="text-2xl font-bold text-green-700 mt-2">{formatCOP(totalIngresos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 uppercase">Total egresos</p>
          <p className="text-2xl font-bold text-red-600 mt-2">{formatCOP(totalEgresos)}</p>
        </div>
        <div className={`rounded-xl p-5 ${totalNeto >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
          <p className={`text-xs uppercase ${totalNeto >= 0 ? 'text-green-100' : 'text-red-100'}`}>Neto</p>
          <p className="text-2xl font-bold text-white mt-2">{formatCOP(totalNeto)}</p>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No hay movimientos con cuenta asignada en este período{sedeActual ? ` para sede ${sedeActual.codigo}` : ''}.
          <p className="text-xs mt-2">Los pagos nuevos incluirán la cuenta automáticamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filas.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="font-semibold text-gray-900">{f.nombre}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ingresos</span>
                  <span className="font-medium text-green-700">{formatCOP(f.ingresos)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Egresos</span>
                  <span className="font-medium text-red-600">{formatCOP(f.egresos)}</span>
                </div>
                <div className="h-px bg-gray-100" />
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">Neto</span>
                  <span className={f.neto >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {formatCOP(f.neto)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filas.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Solo se muestran cuentas con pagos que tengan cuenta asignada.
          Los pagos históricos aparecerán aquí a medida que se registren nuevos.
        </p>
      )}
    </div>
  )
}
