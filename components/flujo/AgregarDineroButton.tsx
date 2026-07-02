'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarIngresoAction } from '@/app/actions/traslados'
import { formatCOP } from '@/lib/utils/format'

type CuentaOpcion = { id: string; nombre: string; tipo: string }

// Registra un ingreso externo: dinero que entra de afuera (capital, préstamo,
// devolución…) y sube el saldo de la cuenta elegida. No sale de ninguna otra cuenta.
export function AgregarDineroButton({ cuentas }: { cuentas: CuentaOpcion[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const [cuenta, setCuenta] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')

  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0

  function confirmar() {
    setError('')
    if (!cuenta) { setError('Selecciona la cuenta que recibe el dinero'); return }
    if (montoNum <= 0) { setError('Escribe el monto'); return }
    start(async () => {
      const r = await registrarIngresoAction({ cuenta_id: cuenta, monto: montoNum, notas })
      if (!r.ok) { setError(r.error); return }
      setOpen(false); setMonto(''); setNotas(''); setCuenta('')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError('') }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700"
      >
        ➕ Agregar dinero
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Agregar dinero</h2>
              <p className="text-xs text-gray-500 mt-0.5">Dinero que entra de afuera (capital, préstamo, devolución…). Sube el saldo de la cuenta, sin salir de otra.</p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta que recibe</label>
                <select value={cuenta} onChange={e => setCuenta(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">— Selecciona la cuenta —</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
                <input type="text" inputMode="numeric" value={monto}
                  onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                {montoNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(montoNum)}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Concepto (opcional)</label>
                <input type="text" value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Ej: aporte de capital, préstamo, devolución…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmar} disabled={pending}
                className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Registrando…' : 'Agregar dinero'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
