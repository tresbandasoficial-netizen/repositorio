'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCOP, formatMiles, hoyBogota } from '@/lib/utils/format'
import { TipoMensajeria, MENSAJERIA_LABELS } from '@/types'
import { cuadrarMensajeriaAction } from '@/app/actions/mensajerias'
import type {
  CuadreMensajeria,
  RecaudoPendiente,
  LiquidacionEntry,
  DomicilioPagadoTB,
} from '@/app/actions/mensajerias'

const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo']

// Enlace a una factura por su número (lleva al detalle con sus artículos).
function FacLink({ numero }: { numero: string }) {
  return (
    <Link href={`/facturacion/n/${encodeURIComponent(numero)}`} className="text-blue-600 hover:underline">
      Fac. {numero}
    </Link>
  )
}

function aNumero(v: string): number {
  return parseInt(v.replace(/\D/g, ''), 10) || 0
}

interface Props {
  cuadres: CuadreMensajeria[]
  recaudos: RecaudoPendiente[]
  liquidaciones: LiquidacionEntry[]
  domiciliosTB: DomicilioPagadoTB[]
  activaMensajeria: TipoMensajeria
}

function haceDias(n: number): string {
  return new Date(Date.parse(`${hoyBogota()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
}

export function MensajeriasClientPage({ cuadres, recaudos, liquidaciones, domiciliosTB, activaMensajeria }: Props) {
  const router = useRouter()
  // Domicilios que paga TB (solo consulta): rango de fechas para confirmar con el mensajero.
  const [domDesde, setDomDesde] = useState(haceDias(7))
  const [domHasta, setDomHasta] = useState(hoyBogota())
  const domRango = domiciliosTB.filter(d => d.fecha >= domDesde && d.fecha <= domHasta)
  const domPorDia = [...new Set(domRango.map(d => d.fecha))].map(f => {
    const items = domRango.filter(d => d.fecha === f)
    return { fecha: f, items, total: items.reduce((s, d) => s + d.valor, 0) }
  })
  // Por cobro: si el dueño lo tachó (el mensajero lo entregó) y el valor que recogió.
  const [sel, setSel] = useState<Record<string, { on: boolean; monto: string }>>({})
  const [fecha, setFecha] = useState(hoyBogota())
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const estado = (r: RecaudoPendiente) => sel[r.id] ?? { on: false, monto: String(r.monto) }

  const marcados = recaudos.filter(r => estado(r).on)
  const recogido = marcados.reduce((s, r) => s + aNumero(estado(r).monto), 0)
  const todosMarcados = recaudos.length > 0 && marcados.length === recaudos.length
  const totalPendiente = recaudos.reduce((s, r) => s + r.monto, 0)

  function toggle(r: RecaudoPendiente) {
    const e = estado(r)
    setSel(s => ({ ...s, [r.id]: { ...e, on: !e.on } }))
  }

  function setMonto(r: RecaudoPendiente, monto: string) {
    setSel(s => ({ ...s, [r.id]: { on: true, monto } }))
  }

  function toggleTodos() {
    const on = !todosMarcados
    const next: Record<string, { on: boolean; monto: string }> = {}
    for (const r of recaudos) next[r.id] = { on, monto: estado(r).monto }
    setSel(next)
  }

  function cambiarMensajeria(m: TipoMensajeria) {
    if (m === activaMensajeria) return
    router.push(`/mensajerias?mensajeria=${m}`)
  }

  function confirmar() {
    setError(null)
    setExito(null)
    if (marcados.length === 0) { setError('Marca al menos un cobro que el mensajero te entregó'); return }
    if (marcados.some(r => aNumero(estado(r).monto) <= 0)) { setError('Cada cobro marcado necesita un valor mayor a cero'); return }

    start(async () => {
      const r = await cuadrarMensajeriaAction({
        mensajeria: activaMensajeria,
        fecha,
        items: marcados.map(x => ({ id: x.id, monto: aNumero(estado(x).monto) })),
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      setExito(
        `Cuadre guardado: ${r.cobros} cobro${r.cobros === 1 ? '' : 's'}, entraron ${formatCOP(r.recogido)} a Efectivo Bucaramanga.`
      )
      setSel({})
      setNotas('')
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mensajerías</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Marca los cobros que el mensajero te entregó y confirma. Entran completos a Efectivo Bucaramanga.
        </p>
      </div>

      {/* Tabs mensajerías */}
      <div className="flex gap-2">
        {MENSAJERIAS.map(m => {
          const c = cuadres.find(x => x.mensajeria === m)
          const pendiente = c?.recaudos_pendientes ?? 0
          return (
            <button
              key={m}
              onClick={() => cambiarMensajeria(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activaMensajeria === m
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {MENSAJERIA_LABELS[m]}
              {pendiente > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activaMensajeria === m ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'
                }`}>
                  {formatCOP(pendiente)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {exito && (
        <p className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg px-4 py-2">{exito}</p>
      )}

      {recaudos.length === 0 ? (
        <div className="bg-green-50 rounded-xl border border-green-100 p-6 text-center">
          <p className="text-green-800 font-medium">Cuadre al día con {MENSAJERIA_LABELS[activaMensajeria]}</p>
          <p className="text-green-600 text-sm mt-1">No hay cobros pendientes por entregar</p>
        </div>
      ) : (
        <>
          {/* Cobros pendientes: se tachan los que el mensajero entregó */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Cobros que {MENSAJERIA_LABELS[activaMensajeria]} tiene en la calle</p>
                <p className="text-xs text-gray-400">
                  {recaudos.length} {recaudos.length === 1 ? 'cobro' : 'cobros'} · {formatCOP(totalPendiente)} por entregar
                </p>
              </div>
              <button onClick={toggleTodos} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
            <ul className="divide-y divide-gray-50">
              {recaudos.map(r => {
                const e = estado(r)
                return (
                  <li key={r.id} className={`px-5 py-3 flex items-center gap-4 ${e.on ? 'bg-green-50/40' : ''}`}>
                    <input
                      type="checkbox"
                      checked={e.on}
                      onChange={() => toggle(r)}
                      className="w-4 h-4 accent-green-600 shrink-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {r.cliente_nombre ?? 'Cliente'}
                        {r.numero_factura && <span className="ml-2 text-xs">· <FacLink numero={r.numero_factura} /></span>}
                      </p>
                      <p className="text-xs text-gray-400">{r.fecha}</p>
                    </div>
                    <span className="relative shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="text" inputMode="numeric"
                        value={formatMiles(e.monto)}
                        onChange={ev => setMonto(r, ev.target.value.replace(/\D/g, ''))}
                        title="Valor que el mensajero recogió (edítalo si es distinto)"
                        className="w-28 pl-5 pr-2 py-1 rounded border border-gray-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Cuadre */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between text-gray-700">
                <span>Cobros marcados ({marcados.length})</span>
                <span className="font-medium text-green-700">{formatCOP(recogido)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
                <span>Entra a Efectivo Bucaramanga</span>
                <span>{formatCOP(recogido)}</span>
              </div>
              <p className="text-[11px] text-gray-400 pt-1">
                Los domicilios no se descuentan aquí: regístralos a mano en Gastos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notas</label>
                <input
                  type="text"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Referencia, comentario..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>
            )}

            <button
              onClick={confirmar}
              disabled={isPending || marcados.length === 0}
              className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : 'Confirmar cuadre'}
            </button>
          </div>
        </>
      )}

      {/* Domicilios que pagamos nosotros: solo consulta, no suma ni descuenta nada */}
      <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-orange-100 bg-orange-50 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-orange-800">Domicilios que pagamos nosotros — {MENSAJERIA_LABELS[activaMensajeria]}</p>
            <p className="text-xs text-orange-700/80">
              Solo para confirmar con lo que apunta el mensajero. No se descuenta ni se suma en ningún lado.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <label className="flex items-center gap-1">Desde
              <input type="date" value={domDesde} onChange={e => setDomDesde(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs" />
            </label>
            <label className="flex items-center gap-1">Hasta
              <input type="date" value={domHasta} onChange={e => setDomHasta(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs" />
            </label>
          </div>
        </div>
        {domPorDia.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No hay domicilios pagados por nosotros en ese rango.</p>
        ) : (
          <>
            {domPorDia.map(dia => (
              <div key={dia.fecha}>
                <div className="px-5 py-1.5 bg-gray-50 border-y border-gray-100 flex justify-between text-xs font-semibold text-gray-600">
                  <span>{dia.fecha} · {dia.items.length} {dia.items.length === 1 ? 'domicilio' : 'domicilios'}</span>
                  <span>{formatCOP(dia.total)}</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {dia.items.map(d => (
                    <li key={d.id} className="px-5 py-2 flex items-center justify-between gap-4 text-sm">
                      <span className="text-gray-700 truncate">
                        {d.cliente_nombre}
                        {d.numero_factura && <span className="ml-2 text-xs">· <FacLink numero={d.numero_factura} /></span>}
                      </span>
                      <span className="font-medium text-orange-600 whitespace-nowrap">{formatCOP(d.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="px-5 py-2.5 border-t-2 border-gray-200 bg-gray-50 flex justify-between text-sm font-bold text-gray-900">
              <span>Total del rango ({domRango.length})</span>
              <span>{formatCOP(domRango.reduce((s, d) => s + d.valor, 0))}</span>
            </div>
          </>
        )}
      </div>

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
