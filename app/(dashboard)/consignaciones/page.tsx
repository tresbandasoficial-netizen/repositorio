import { redirect } from 'next/navigation'
import { getSesion } from '@/lib/auth/acceso'
import { createClient } from '@/lib/supabase/server'
import { formatCOP } from '@/lib/utils/format'
import { LIMITE_CONSIGNACION_DEFECTO } from '@/lib/consignaciones'
import { FilaCuenta, nivelDe, type CuentaConsignacion } from '@/components/consignaciones/FilaCuenta'

export default async function ConsignacionesPage() {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') redirect('/dashboard')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_consignaciones_cuenta')
    .select('cuenta_id, nombre, tipo, titular, limite_consignacion, anio, consignado, movimientos, ultima_consignacion')
    .order('consignado', { ascending: false })

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">No se pudo cargar el conteo</p>
          <p className="mt-1 text-sm text-red-700">{error.message}</p>
        </div>
      </div>
    )
  }

  const cuentas = (data ?? []) as Array<CuentaConsignacion & { anio: number }>
  const anio = cuentas[0]?.anio ?? new Date().getFullYear()
  const conMovimiento = cuentas.filter(c => c.consignado > 0)
  const quietas = cuentas.filter(c => c.consignado === 0)

  const topeDe = (c: CuentaConsignacion) => c.limite_consignacion ?? LIMITE_CONSIGNACION_DEFECTO
  const enRiesgo = conMovimiento.filter(c => nivelDe(c.consignado, topeDe(c)) !== 'ok')

  // Agrupado por titular: el tope de la DIAN es por PERSONA, así que dos cuentas
  // de la misma persona suman para el mismo umbral.
  const porTitular = new Map<string, { consignado: number; cuentas: string[] }>()
  for (const c of conMovimiento) {
    const quien = c.titular?.trim() || 'Sin titular asignado'
    const g = porTitular.get(quien) ?? { consignado: 0, cuentas: [] }
    g.consignado += c.consignado
    g.cuentas.push(c.nombre)
    porTitular.set(quien, g)
  }
  const titulares = [...porTitular.entries()]
    .map(([quien, g]) => ({ quien, ...g }))
    .sort((a, b) => b.consignado - a.consignado)

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Consignaciones {anio}</h1>
        <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
          Cuánto ha entrado a cada cuenta este año, para no pasarse del tope. Cuenta los pagos de
          pedidos, los abonos a facturas, los pagos de mensajería y el efectivo que se consigna.
          Las cajas de efectivo no aparecen: la plata en el cajón no es una consignación.
        </p>
      </div>

      {/* Lo que necesita atención va primero y grande */}
      {enRiesgo.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-900">
            {enRiesgo.length === 1
              ? 'Una cuenta está cerca del tope'
              : `${enRiesgo.length} cuentas están cerca del tope`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {enRiesgo.map(c => {
              const restante = topeDe(c) - c.consignado
              return (
                <li key={c.cuenta_id} className="text-sm text-red-800">
                  <strong>{c.nombre}</strong>
                  {c.titular ? ` (${c.titular})` : ''} — {formatCOP(c.consignado)},{' '}
                  {restante > 0
                    ? <>le quedan <strong>{formatCOP(restante)}</strong></>
                    : <>ya se pasó por <strong>{formatCOP(Math.abs(restante))}</strong></>}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-red-700">
            Para no seguir sumando ahí, cobra en otra cuenta que tenga margen.
          </p>
        </div>
      )}

      {/* Por titular: el tope es por persona, no por cuenta */}
      {titulares.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Sumado por titular</p>
            <p className="text-xs text-gray-400 mt-0.5">
              El tope es por persona: si alguien tiene dos cuentas, las dos suman al mismo umbral.
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {titulares.map(t => {
              const pct = (t.consignado / LIMITE_CONSIGNACION_DEFECTO) * 100
              const nivel = nivelDe(t.consignado, LIMITE_CONSIGNACION_DEFECTO)
              return (
                <div key={t.quien} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="font-medium text-gray-900 w-40">{t.quien}</span>
                  <span className="text-xs text-gray-400 flex-1 min-w-32 truncate">
                    {t.cuentas.join(' + ')}
                  </span>
                  <span className="font-bold text-gray-900 tabular-nums">{formatCOP(t.consignado)}</span>
                  <span className={`text-sm font-semibold tabular-nums w-16 text-right ${
                    nivel === 'ok' ? 'text-emerald-700' : nivel === 'alerta' ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detalle por cuenta */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Cuenta por cuenta</h2>
        {conMovimiento.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no hay consignaciones este año.</p>
        ) : (
          conMovimiento.map(c => <FilaCuenta key={c.cuenta_id} cuenta={c} />)
        )}
      </div>

      {quietas.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-gray-600">
            {quietas.length} cuentas sin consignaciones este año
          </summary>
          <div className="border-t border-gray-100 px-4 py-3 space-y-3">
            {quietas.map(c => <FilaCuenta key={c.cuenta_id} cuenta={c} />)}
          </div>
        </details>
      )}

      <p className="text-xs text-gray-400">
        El tope general está en {formatCOP(LIMITE_CONSIGNACION_DEFECTO)}. Cada cuenta puede tener el
        suyo con &ldquo;Cambiar titular o tope&rdquo;. Verifica el valor del año con tu contador — cambia
        con la UVT.
      </p>
    </div>
  )
}
