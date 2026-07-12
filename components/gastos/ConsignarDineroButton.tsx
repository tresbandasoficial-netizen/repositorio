'use client'

import { useState, useTransition } from 'react'
import { registrarTrasladoAction } from '@/app/actions/traslados'
import { formatCOP, formatMiles } from '@/lib/utils/format'

type CuentaOpcion = { id: string; nombre: string }

// Consignación / envío de dinero entre sedes: sale de la caja de la sede
// (origen) y entra a la cuenta seleccionada (ej: la asesora de Santa Rosa
// consigna efectivo en una cuenta de Bucaramanga). Se registra como traslado:
// resta en el origen y suma en el destino al instante — NO es un gasto.
export function ConsignarDineroButton({
  cuentasOrigen,
  cuentasDestino,
  origenDefaultId,
}: {
  cuentasOrigen: CuentaOpcion[]
  cuentasDestino: CuentaOpcion[]
  origenDefaultId: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [exito, setExito] = useState<string | null>(null)

  const [origen, setOrigen] = useState(origenDefaultId)
  const [destino, setDestino] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')

  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0

  function confirmar() {
    setError('')
    if (!origen)  { setError('Selecciona de dónde sale el dinero'); return }
    if (!destino) { setError('Selecciona la cuenta que recibe el dinero'); return }
    if (origen === destino) { setError('Las cuentas deben ser distintas'); return }
    if (montoNum <= 0) { setError('Escribe el monto'); return }
    start(async () => {
      const r = await registrarTrasladoAction({
        origen_cuenta_id: origen,
        destino_cuenta_id: destino,
        monto: montoNum,
        notas: notas.trim() || 'Consignación entre sedes',
      })
      if (!r.ok) { setError(r.error); return }
      const nombreDestino = cuentasDestino.find(c => c.id === destino)?.nombre ?? ''
      setExito(`${formatCOP(montoNum)} enviados a ${nombreDestino}`)
      setMonto(''); setNotas('')
      setTimeout(() => { setOpen(false); setExito(null); window.location.reload() }, 1600)
    })
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(''); setExito(null) }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
      >
        🏦 Consignar dinero
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Consignar / enviar dinero</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Sale de tu caja y entra a la cuenta que elijas. Se suma allá automáticamente.
              </p>
            </div>

            {exito ? (
              <div className="px-6 py-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-bold text-gray-900">{exito}</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">De (sale el dinero)</label>
                    <select value={origen} onChange={e => setOrigen(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Cuenta origen —</option>
                      {cuentasOrigen.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">A (recibe el dinero)</label>
                    <select value={destino} onChange={e => setDestino(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Cuenta destino —</option>
                      {cuentasDestino.filter(c => c.id !== origen).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="text" inputMode="numeric" value={formatMiles(monto)}
                        onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {montoNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(montoNum)}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
                    <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                      placeholder="Ej: consignación Bancolombia, comprobante #123"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                  <button onClick={() => setOpen(false)}
                    className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button onClick={confirmar} disabled={pending}
                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
                    {pending ? 'Registrando…' : 'Consignar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
