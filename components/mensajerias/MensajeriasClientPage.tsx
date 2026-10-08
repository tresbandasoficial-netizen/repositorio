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
  activaMensajeria: TipoMensajeria
}

export function MensajeriasClientPage({ cuadres, recaudos, liquidaciones, activaMensajeria }: Props) {
  const router = useRouter()
  // Por cobro: si el dueño lo tachó (el mensajero lo entregó) y el valor que recogió.
  const [sel, setSel] = useState<Record<string, { on: boolean; monto: string }>>({})
  const [descuento, setDescuento] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const estado = (r: RecaudoPendiente) => sel[r.id] ?? { on: false, monto: String(r.monto) }

  const marcados = recaudos.filter(r => estado(r).on)
  const recogido = marcados.reduce((s, r) => s + aNumero(estado(r).monto), 0)
  const desc = aNumero(descuento)
  const neto = recogido - desc
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
    if (desc > recogido) { setError('El descuento de domicilios no puede ser mayor que lo recogido. Si les debes plata, regístrala en Gastos.'); return }

    start(async () => {
      const r = await cuadrarMensajeriaAction({
        mensajeria: activaMensajeria,
        fecha,
        items: marcados.map(x => ({ id: x.id, monto: aNumero(estado(x).monto) })),
        descuento: desc,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      setExito(
        `Cuadre guardado: ${r.cobros} cobro${r.cobros === 1 ? '' : 's'}, entraron ${formatCOP(r.neto)} a Efectivo Bucaramanga` +
        (r.descuento > 0 ? ` (descuento de domicilios ${formatCOP(r.descuento)})` : '') + '.'
      )
      setSel({})
      setDescuento('')
      setNotas('')
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mensajerías</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Marca los cobros que el mensajero te entregó, anota cuántos domicilios descuenta y confirma.
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
              <div className="flex justify-between text-gray-700">
                <span>Descuento de domicilios</span>
                <span className="font-medium text-orange-600">− {formatCOP(desc)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
                <span>Entra a Efectivo Bucaramanga</span>
                <span className={neto < 0 ? 'text-red-600' : ''}>{formatCOP(neto)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descuento de domicilios</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="text" inputMode="numeric"
                    value={formatMiles(descuento)}
                    onChange={e => setDescuento(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Lo que el mensajero informa que descuenta. Se registra como gasto de domicilios.</p>
              </div>
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
