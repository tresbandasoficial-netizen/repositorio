'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarTrasladoAction } from '@/app/actions/traslados'
import { formatCOP } from '@/lib/utils/format'

type CuentaOpcion = { id: string; nombre: string; tipo: string }

// Registra una "Entrega de efectivo": traslado de una cuenta a otra. Por defecto
// origen = "Efectivo" (la de los asesores) y destino = "Caja Bucaramanga" (dueño).
export function EntregaEfectivoButton({ cuentas }: { cuentas: CuentaOpcion[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const defaultOrigen = cuentas.find(c => c.nombre.toLowerCase() === 'efectivo')?.id
    ?? cuentas.find(c => c.tipo === 'efectivo')?.id ?? ''
  const defaultDestino = cuentas.find(c => c.nombre.toLowerCase().includes('caja bucaramanga'))?.id ?? ''

  const [origen, setOrigen] = useState(defaultOrigen)
  const [destino, setDestino] = useState(defaultDestino)
  const [monto, setMonto] = useState('')

  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0

  function confirmar() {
    setError('')
    if (!origen || !destino) { setError('Selecciona origen y destino'); return }
    if (origen === destino) { setError('Las cuentas deben ser distintas'); return }
    if (montoNum <= 0) { setError('Escribe el monto'); return }
    start(async () => {
      const r = await registrarTrasladoAction({ origen_cuenta_id: origen, destino_cuenta_id: destino, monto: montoNum })
      if (!r.ok) { setError(r.error); return }
      setOpen(false); setMonto('')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError('') }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
      >
        💵 Entrega de efectivo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Entrega de efectivo</h2>
              <p className="text-xs text-gray-500 mt-0.5">Pasa plata de una cuenta a otra (ej: Efectivo → Caja Bucaramanga)</p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">De (sale)</label>
                <select value={origen} onChange={e => setOrigen(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Cuenta origen —</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">A (entra)</label>
                <select value={destino} onChange={e => setDestino(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Cuenta destino —</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
                <input type="text" inputMode="numeric" value={monto}
                  onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {montoNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(montoNum)}</p>}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmar} disabled={pending}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Registrando…' : 'Registrar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
