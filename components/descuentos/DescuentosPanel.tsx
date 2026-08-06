'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarDescuentoAction, anularDescuentoAction } from '@/app/actions/descuentos'
import { formatCOP, formatFecha, hoyBogota } from '@/lib/utils/format'
import { UserMinus } from 'lucide-react'

export type DescuentoRow = {
  id: string
  usuario_id: string
  usuario_nombre: string
  fecha: string
  motivo: string
  valor: number
  pedido_ref: string | null
  anulado: boolean
}

type Empleado = { id: string; nombre: string }

function formatMiles(v: string): string {
  const n = v.replace(/\D/g, '')
  return n ? parseInt(n, 10).toLocaleString('es-CO') : ''
}

// Panel de descuentos por errores: formulario de registro + lista del mes con
// total por empleado (lo que se le descuenta en la nómina).
export function DescuentosPanel({ empleados, descuentos }: { empleados: Empleado[]; descuentos: DescuentoRow[] }) {
  const router = useRouter()
  const [usuarioId, setUsuarioId] = useState('')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())
  const [pedidoRef, setPedidoRef] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, start] = useTransition()

  function registrar() {
    setError(null)
    start(async () => {
      const r = await registrarDescuentoAction({
        usuario_id: usuarioId,
        valor: parseInt(valor.replace(/\D/g, ''), 10) || 0,
        motivo,
        fecha,
        pedido_ref: pedidoRef || undefined,
      })
      if (!r.ok) { setError(r.error); return }
      setValor(''); setMotivo(''); setPedidoRef('')
      router.refresh()
    })
  }

  function anular(id: string, quien: string, cuanto: number) {
    if (!confirm(`¿Anular el descuento de ${formatCOP(cuanto)} a ${quien}? Queda en la lista como anulado, sin sumar.`)) return
    start(async () => {
      const r = await anularDescuentoAction(id)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  // Totales del mes por empleado (sin anulados)
  const totales = new Map<string, { nombre: string; total: number; errores: number }>()
  for (const d of descuentos) {
    if (d.anulado) continue
    const t = totales.get(d.usuario_id) ?? { nombre: d.usuario_nombre, total: 0, errores: 0 }
    t.total += d.valor
    t.errores += 1
    totales.set(d.usuario_id, t)
  }

  return (
    <div className="space-y-5">
      {/* Registro */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Registrar un error</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            value={usuarioId}
            onChange={e => setUsuarioId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Empleado…</option>
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <input
            type="text" inputMode="numeric" value={formatMiles(valor)}
            onChange={e => setValor(e.target.value)}
            placeholder="Valor a descontar"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text" value={pedidoRef} onChange={e => setPedidoRef(e.target.value)}
            placeholder="Pedido relacionado (opcional)"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <textarea
          value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="¿Qué error fue? — Ej: cobró la licra a $150.000 siendo $190.000; faltante en el cuadre del 12; envió la talla equivocada y tocó pagar el reenvío…"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button
          onClick={registrar}
          disabled={guardando || !usuarioId || !motivo.trim() || !(parseInt(valor.replace(/\D/g, ''), 10) > 0)}
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <UserMinus size={15} /> {guardando ? 'Guardando…' : 'Registrar descuento'}
        </button>
      </div>

      {/* Totales del mes por empleado */}
      {totales.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...totales.values()].sort((a, b) => b.total - a.total).map(t => (
            <div key={t.nombre} className="bg-red-50 rounded-2xl border border-red-200 p-4">
              <p className="text-sm font-bold text-gray-900">{t.nombre}</p>
              <p className="text-lg font-bold text-red-700">{formatCOP(t.total)}</p>
              <p className="text-[11px] text-red-500">{t.errores} error{t.errores !== 1 ? 'es' : ''} este mes — descontar en nómina</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista del mes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        {descuentos.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Sin descuentos este mes. 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pedido</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {descuentos.map(d => (
                <tr key={d.id} className={d.anulado ? 'opacity-45' : ''}>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatFecha(d.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{d.usuario_nombre}</td>
                  <td className="px-4 py-2.5 text-gray-600">{d.motivo}{d.anulado && <span className="ml-2 text-[10px] font-bold text-gray-400 uppercase">Anulado</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-blue-700">{d.pedido_ref ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${d.anulado ? 'text-gray-400 line-through' : 'text-red-700'}`}>
                    {formatCOP(d.valor)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!d.anulado && (
                      <button
                        onClick={() => anular(d.id, d.usuario_nombre, d.valor)}
                        className="text-xs text-gray-400 hover:text-red-600 font-medium"
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
