'use client'

import { useState, useTransition } from 'react'
import { formatCOP } from '@/lib/utils/format'
import { TipoMensajeria, MENSAJERIA_LABELS, Cuenta } from '@/types'
import { liquidarMensajeriaAction } from '@/app/actions/mensajerias'
import type {
  CuadreMensajeria,
  RecaudoPendiente,
  DomicilioTBPendiente,
  LiquidacionEntry,
} from '@/app/actions/mensajerias'

function hoy() { return new Date().toISOString().slice(0, 10) }

const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo']

interface Props {
  cuadres: CuadreMensajeria[]
  recaudos: RecaudoPendiente[]
  domiciliosTB: DomicilioTBPendiente[]
  liquidaciones: LiquidacionEntry[]
  cuentas: Cuenta[]
  activaMensajeria: TipoMensajeria
}

export function MensajeriasClientPage({
  cuadres, recaudos, domiciliosTB, liquidaciones, cuentas, activaMensajeria,
}: Props) {
  const [activa, setActiva] = useState<TipoMensajeria>(activaMensajeria)
  const [mostrarLiquidar, setMostrarLiquidar] = useState(false)
  const [form, setForm] = useState({ monto: '', fecha: hoy(), cuenta_id: '', notas: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const cuadreActivo = cuadres.find(c => c.mensajeria === activa) ?? {
    mensajeria: activa, recaudos_pendientes: 0, domicilios_tb: 0, saldo_neto: 0,
  }

  const hayPendientes = cuadreActivo.recaudos_pendientes > 0 || cuadreActivo.domicilios_tb > 0

  // Desglose día por día: por cada fecha, lo que el mensajero nos debe (recaudos
  // que cobró) menos lo que TB le debe (domicilios asumidos) = neto del día.
  const porDia = (() => {
    const m = new Map<string, { recaudos: number; domicilios: number }>()
    for (const r of recaudos)     { const e = m.get(r.fecha) ?? { recaudos: 0, domicilios: 0 }; e.recaudos   += r.monto; m.set(r.fecha, e) }
    for (const d of domiciliosTB) { const e = m.get(d.fecha) ?? { recaudos: 0, domicilios: 0 }; e.domicilios += d.monto; m.set(d.fecha, e) }
    return [...m.entries()]
      .map(([fecha, v]) => ({ fecha, recaudos: v.recaudos, domicilios: v.domicilios, neto: v.recaudos - v.domicilios }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  })()

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function cambiarMensajeria(m: TipoMensajeria) {
    setActiva(m)
    setMostrarLiquidar(false)
    window.history.replaceState(null, '', `/mensajerias?mensajeria=${m}`)
    window.location.reload()
  }

  function abrirLiquidar() {
    setError(null)
    setForm({
      monto: Math.abs(cuadreActivo.saldo_neto).toString(),
      fecha: hoy(),
      cuenta_id: '',
      notas: '',
    })
    setMostrarLiquidar(true)
  }

  function handleLiquidar() {
    setError(null)
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10)
    if (!monto || monto <= 0) { setError('Ingresa el monto liquidado'); return }

    start(async () => {
      const r = await liquidarMensajeriaAction({
        mensajeria: activa,
        monto,
        fecha:     form.fecha,
        cuenta_id: form.cuenta_id || null,
        notas:     form.notas,
      })
      if (!r.ok) { setError(r.error); return }
      setMostrarLiquidar(false)
      setForm({ monto: '', fecha: hoy(), cuenta_id: '', notas: '' })
      window.location.reload()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mensajerías</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cuadre de recaudos y domicilios</p>
      </div>

      {/* Tabs mensajerías */}
      <div className="flex gap-2">
        {MENSAJERIAS.map(m => {
          const c = cuadres.find(x => x.mensajeria === m)
          const neto = c?.saldo_neto ?? 0
          return (
            <button
              key={m}
              onClick={() => cambiarMensajeria(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activa === m
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {MENSAJERIA_LABELS[m]}
              {neto !== 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activa === m ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'
                }`}>
                  {neto > 0 ? `↑ ${formatCOP(neto)}` : `↓ ${formatCOP(Math.abs(neto))}`}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tarjetas de cuadre */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-0.5">Mensajero me debe</p>
          <p className="text-xs text-gray-400 mb-3">Recaudos cobrados al cliente</p>
          <p className="text-2xl font-bold text-gray-900">{formatCOP(cuadreActivo.recaudos_pendientes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-0.5">Yo le debo</p>
          <p className="text-xs text-gray-400 mb-3">Domicilios asumidos por TB</p>
          <p className="text-2xl font-bold text-orange-600">{formatCOP(cuadreActivo.domicilios_tb)}</p>
        </div>
        <div className={`rounded-xl p-4 ${
          cuadreActivo.saldo_neto > 0 ? 'bg-green-600' :
          cuadreActivo.saldo_neto < 0 ? 'bg-red-600' :
          'bg-gray-100'
        }`}>
          <p className={`text-xs mb-0.5 ${cuadreActivo.saldo_neto !== 0 ? 'text-white/80' : 'text-gray-500'}`}>
            Saldo neto
          </p>
          <p className={`text-xs mb-3 ${cuadreActivo.saldo_neto !== 0 ? 'text-white/70' : 'text-gray-400'}`}>
            {cuadreActivo.saldo_neto > 0 ? 'Mensajero nos paga' :
             cuadreActivo.saldo_neto < 0 ? 'TB le paga al mensajero' :
             'Cuadre al día'}
          </p>
          <p className={`text-2xl font-bold ${cuadreActivo.saldo_neto !== 0 ? 'text-white' : 'text-gray-900'}`}>
            {formatCOP(Math.abs(cuadreActivo.saldo_neto))}
          </p>
        </div>
      </div>

      {/* Botón liquidar */}
      {hayPendientes && !mostrarLiquidar && (
        <div className="flex justify-end">
          <button
            onClick={abrirLiquidar}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
          >
            Liquidar cuadre con {MENSAJERIA_LABELS[activa]}
          </button>
        </div>
      )}

      {/* Panel de liquidación */}
      {mostrarLiquidar && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Liquidar cuadre con {MENSAJERIA_LABELS[activa]}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {cuadreActivo.saldo_neto > 0
                ? `${MENSAJERIA_LABELS[activa]} te entrega el neto y quedan en cero.`
                : cuadreActivo.saldo_neto < 0
                ? `TB le paga a ${MENSAJERIA_LABELS[activa]} el neto y quedan en cero.`
                : 'El cuadre está en cero — solo confirma el cierre.'}
            </p>
          </div>

          {/* Desglose */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
            <div className="flex justify-between text-gray-700">
              <span>Recaudos que mensajero trae</span>
              <span className="font-medium text-green-700">+ {formatCOP(cuadreActivo.recaudos_pendientes)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Domicilios que TB asumió</span>
              <span className="font-medium text-red-600">− {formatCOP(cuadreActivo.domicilios_tb)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
              <span>Neto a {cuadreActivo.saldo_neto >= 0 ? 'recibir' : 'pagar'}</span>
              <span>{formatCOP(Math.abs(cuadreActivo.saldo_neto))}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => set('fecha', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto liquidado *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.monto}
                  onChange={e => set('monto', e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Cuenta {cuadreActivo.saldo_neto >= 0 ? 'de ingreso' : 'de egreso'}
              </label>
              <select
                value={form.cuenta_id}
                onChange={e => set('cuenta_id', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">Sin especificar</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notas</label>
              <input
                type="text"
                value={form.notas}
                onChange={e => set('notas', e.target.value)}
                placeholder="Período, referencia..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleLiquidar}
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? 'Liquidando...' : 'Confirmar liquidación'}
            </button>
            <button
              onClick={() => setMostrarLiquidar(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Cuadre al día */}
      {!hayPendientes && (
        <div className="bg-green-50 rounded-xl border border-green-100 p-6 text-center">
          <p className="text-green-800 font-medium">Cuadre al día con {MENSAJERIA_LABELS[activa]}</p>
          <p className="text-green-600 text-sm mt-1">No hay recaudos ni domicilios pendientes</p>
        </div>
      )}

      {/* Lo que nos deben por día */}
      {porDia.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Lo que nos deben por día</p>
            <p className="text-xs text-gray-400">Recaudos cobrados − domicilios asumidos por TB</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2">Fecha</th>
                <th className="text-right px-4 py-2">Nos deben</th>
                <th className="text-right px-4 py-2">Les debemos</th>
                <th className="text-right px-5 py-2">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {porDia.map(d => (
                <tr key={d.fecha} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-gray-700">{d.fecha}</td>
                  <td className="px-4 py-2.5 text-right text-green-700">{d.recaudos ? formatCOP(d.recaudos) : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-orange-600">{d.domicilios ? formatCOP(d.domicilios) : '—'}</td>
                  <td className={`px-5 py-2.5 text-right font-bold ${d.neto >= 0 ? 'text-green-700' : 'text-orange-600'}`}>{formatCOP(d.neto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="px-5 py-2.5 text-xs font-semibold text-gray-600 uppercase">Total</td>
                <td className="px-4 py-2.5 text-right font-bold text-green-700">{formatCOP(porDia.reduce((s, d) => s + d.recaudos, 0))}</td>
                <td className="px-4 py-2.5 text-right font-bold text-orange-600">{formatCOP(porDia.reduce((s, d) => s + d.domicilios, 0))}</td>
                <td className="px-5 py-2.5 text-right font-bold text-gray-900">{formatCOP(porDia.reduce((s, d) => s + d.neto, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Recaudos por cobrar */}
      {recaudos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Recaudos por cobrar</p>
            <p className="text-xs text-gray-400">{recaudos.length} {recaudos.length === 1 ? 'factura' : 'facturas'}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {recaudos.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {r.cliente_nombre ?? 'Cliente'}
                    {r.numero_factura && (
                      <span className="ml-2 text-xs text-gray-400">· Fac. {r.numero_factura}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{r.fecha}</p>
                </div>
                <p className="font-semibold text-green-700 whitespace-nowrap">{formatCOP(r.monto)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Domicilios que TB asumió */}
      {domiciliosTB.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Domicilios que TB asumió</p>
            <p className="text-xs text-gray-400">{domiciliosTB.length} pendientes</p>
          </div>
          <div className="divide-y divide-gray-50">
            {domiciliosTB.map(d => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {d.cliente_nombre ?? d.notas ?? 'Domicilio'}
                    {d.numero_factura && (
                      <span className="ml-2 text-xs text-gray-400">· Fac. {d.numero_factura}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {d.fecha}{d.es_legacy ? ' · registro anterior' : ''}
                  </p>
                </div>
                <p className="font-semibold text-orange-600 whitespace-nowrap">{formatCOP(d.monto)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de liquidaciones */}
      {liquidaciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Historial de liquidaciones</p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {liquidaciones.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-gray-500">{l.fecha}</td>
                  <td className="px-3 py-2.5 text-gray-500">{l.cuenta_nombre ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs">{l.notas ?? '—'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(l.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
