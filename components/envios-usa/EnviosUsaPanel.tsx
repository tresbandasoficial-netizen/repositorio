'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarEnvioUsaAction, eliminarEnvioUsaAction } from '@/app/actions/envios-usa'
import { formatCOP, formatFecha, formatMiles, hoyBogota } from '@/lib/utils/format'
import { Loader2, Plane } from 'lucide-react'

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Panel de envíos USA (solo admin): saldo a favor con la transportadora
// (= saldo de la cuenta Davivienda), registro de lo que cobran por cada caja
// y la plata que ha entrado (pagos de clientes + consignaciones de las sedes).
export function EnviosUsaPanel({ saldo, envios, ingresos }: {
  saldo: number
  envios: Array<{ id: string; fecha: string; descripcion: string; valor: number; cant_zapatos: number; cant_ropa: number; cant_accesorios: number }>
  ingresos: Array<{ fecha: string; detalle: string; monto: number }>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const [valor, setValor] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())
  // Cuántas cosas vienen en la caja, por tipo (para el costo por unidad).
  const [cantZapatos, setCantZapatos] = useState('')
  const [cantRopa, setCantRopa] = useState('')
  const [cantAccesorios, setCantAccesorios] = useState('')

  function registrar() {
    setError('')
    const v = parseInt(valor.replace(/\D/g, ''), 10) || 0
    start(async () => {
      const r = await registrarEnvioUsaAction({
        valor: v, descripcion, fecha,
        cant_zapatos:    parseInt(cantZapatos, 10) || 0,
        cant_ropa:       parseInt(cantRopa, 10) || 0,
        cant_accesorios: parseInt(cantAccesorios, 10) || 0,
      })
      if (!r.ok) { setError(r.error); return }
      setValor(''); setDescripcion(''); setCantZapatos(''); setCantRopa(''); setCantAccesorios('')
      router.refresh()
    })
  }

  // Resumen histórico: cuántas unidades han venido por tipo y cuánto vale
  // traer cada una (solo con las cajas que tienen cantidades registradas).
  const conCantidades = envios.filter(e => (e.cant_zapatos + e.cant_ropa + e.cant_accesorios) > 0)
  const totZapatos    = conCantidades.reduce((s, e) => s + e.cant_zapatos, 0)
  const totRopa       = conCantidades.reduce((s, e) => s + e.cant_ropa, 0)
  const totAccesorios = conCantidades.reduce((s, e) => s + e.cant_accesorios, 0)
  const totUnidades   = totZapatos + totRopa + totAccesorios
  const totValorCajas = conCantidades.reduce((s, e) => s + e.valor, 0)
  const costoPorUnidad = totUnidades > 0 ? Math.round(totValorCajas / totUnidades) : 0

  function eliminar(id: string, valor: number) {
    if (!confirm(`¿Eliminar este cobro de ${formatCOP(valor)}? La plata vuelve al saldo a favor.`)) return
    start(async () => {
      const r = await eliminarEnvioUsaAction(id)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Saldo a favor */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl p-5 text-white shadow-lg shadow-blue-200 flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
          <Plane size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-100">A tu favor con la transportadora</p>
          <p className="text-3xl font-bold tracking-tight">{formatCOP(saldo)}</p>
          <p className="text-xs text-blue-200 mt-0.5">= saldo de la cuenta Davivienda</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Registrar cobro de envío */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Registrar cobro de envío</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_10rem_auto] gap-2">
          <input className={inputCls} value={descripcion} onChange={e => setDescripcion(e.target.value)}
            placeholder="Caja 14 · 12 kg · guía 483920…" />
          <input className={inputCls} type="text" inputMode="numeric" value={formatMiles(valor)}
            onChange={e => setValor(e.target.value.replace(/\D/g, ''))} placeholder="Valor" />
          <input className={inputCls} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          <button onClick={registrar} disabled={pending}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin inline" /> : 'Registrar'}
          </button>
        </div>
        {/* ¿Qué viene en la caja? Cantidades por tipo para el costo por unidad */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">¿Qué viene en la caja?</span>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            👟
            <input className={`${inputCls} !w-16 text-center`} type="number" min="0" value={cantZapatos}
              onChange={e => setCantZapatos(e.target.value)} placeholder="0" title="Pares de zapatos" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            👕
            <input className={`${inputCls} !w-16 text-center`} type="number" min="0" value={cantRopa}
              onChange={e => setCantRopa(e.target.value)} placeholder="0" title="Prendas de ropa" />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            🧢
            <input className={`${inputCls} !w-16 text-center`} type="number" min="0" value={cantAccesorios}
              onChange={e => setCantAccesorios(e.target.value)} placeholder="0" title="Accesorios" />
          </label>
          {(() => {
            const u = (parseInt(cantZapatos, 10) || 0) + (parseInt(cantRopa, 10) || 0) + (parseInt(cantAccesorios, 10) || 0)
            const v = parseInt(valor.replace(/\D/g, ''), 10) || 0
            return u > 0 && v > 0 ? (
              <span className="text-xs font-semibold text-blue-600">
                {u} unidades → {formatCOP(Math.round(v / u))} c/u
              </span>
            ) : null
          })()}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          El valor se descuenta del saldo a favor (sale de la cuenta Davivienda). No es un gasto:
          el costo del envío va dentro del costo de la mercancía en la compra.
        </p>
      </div>

      {/* Cuánto vale traer cada cosa (histórico de cajas con cantidades) */}
      {totUnidades > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2">¿Cuánto me vale traer?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">👟 Zapatos</p>
              <p className="font-bold text-gray-900 tabular-nums">{totZapatos} pares</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">👕 Ropa</p>
              <p className="font-bold text-gray-900 tabular-nums">{totRopa} prendas</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">🧢 Accesorios</p>
              <p className="font-bold text-gray-900 tabular-nums">{totAccesorios} unidades</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">Costo por unidad</p>
              <p className="font-bold text-blue-700 tabular-nums">{formatCOP(costoPorUnidad)}</p>
              <p className="text-[10px] text-blue-400">{formatCOP(totValorCajas)} ÷ {totUnidades} uds</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cobros de envíos */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Envíos cobrados</p>
          {envios.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-400">Sin cobros registrados.</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {envios.map(e => (
                <li key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-gray-800 truncate">{e.descripcion}</span>
                    <span className="text-xs text-gray-400">
                      {formatFecha(e.fecha)}
                      {(e.cant_zapatos + e.cant_ropa + e.cant_accesorios) > 0 && (
                        <>
                          {' · '}
                          {e.cant_zapatos > 0 && `👟${e.cant_zapatos} `}
                          {e.cant_ropa > 0 && `👕${e.cant_ropa} `}
                          {e.cant_accesorios > 0 && `🧢${e.cant_accesorios} `}
                          · {formatCOP(Math.round(e.valor / (e.cant_zapatos + e.cant_ropa + e.cant_accesorios)))} c/u
                        </>
                      )}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-red-600">−{formatCOP(e.valor)}</span>
                    <button onClick={() => eliminar(e.id, e.valor)} disabled={pending}
                      className="text-gray-300 hover:text-red-500" title="Eliminar (devuelve la plata al saldo)">✕</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Plata que entra */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <p className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
            Plata que ha entrado <span className="text-xs font-normal text-gray-400">(últimos movimientos)</span>
          </p>
          {ingresos.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-400">Sin ingresos aún.</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {ingresos.map((m, i) => (
                <li key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-gray-800 truncate">{m.detalle}</span>
                    <span className="text-xs text-gray-400">{formatFecha(m.fecha)}</span>
                  </span>
                  <span className="font-semibold text-green-700 shrink-0">+{formatCOP(m.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
