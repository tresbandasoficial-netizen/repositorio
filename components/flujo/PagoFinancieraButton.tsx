'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarTrasladoAction } from '@/app/actions/traslados'
import { formatCOP, formatMiles } from '@/lib/utils/format'

type CuentaOpcion = { id: string; nombre: string; tipo: string }

const TIPOS_FINANCIERA = ['addi', 'sistecredito', 'bold']

// Registra el pago que hace una financiera (Addi, Sistecrédito) o el datáfono
// (Bold): traslado de la cuenta "por cobrar" a la cuenta bancaria donde
// consignaron. Baja lo pendiente y sube el banco — la venta ya estaba contada.
export function PagoFinancieraButton({ cuentas }: { cuentas: CuentaOpcion[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const financieras = cuentas.filter(c => TIPOS_FINANCIERA.includes(c.tipo))
  const bancarias = cuentas.filter(c => !TIPOS_FINANCIERA.includes(c.tipo) && c.tipo !== 'efectivo')

  const [origen, setOrigen] = useState(financieras.find(c => c.tipo === 'addi')?.id ?? financieras[0]?.id ?? '')
  const [destino, setDestino] = useState(
    bancarias.find(c => c.nombre.toLowerCase().includes('johan') && c.tipo === 'bancolombia')?.id ?? bancarias[0]?.id ?? ''
  )
  const [monto, setMonto] = useState('')

  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0

  function confirmar() {
    setError('')
    if (!origen || !destino) { setError('Selecciona la financiera y la cuenta donde te consignaron'); return }
    if (montoNum <= 0) { setError('Escribe el monto que te consignaron'); return }
    start(async () => {
      try {
        const r = await registrarTrasladoAction({ origen_cuenta_id: origen, destino_cuenta_id: destino, monto: montoNum })
        if (!r.ok) { setError(r.error); return }
        setOpen(false); setMonto('')
        router.refresh()
      } catch {
        setError('No se pudo registrar. Recarga la página (F5) e intenta de nuevo.')
      }
    })
  }

  if (financieras.length === 0) return null

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError('') }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700"
      >
        📋 Pago de financiera
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Pago de financiera</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Cuando Addi, Sistecrédito o Bold te consignan: baja lo pendiente por cobrar y sube tu cuenta.
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">¿Quién te pagó?</label>
                <select value={origen} onChange={e => setOrigen(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  {financieras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">¿A qué cuenta te consignaron?</label>
                <select value={destino} onChange={e => setDestino(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  {bancarias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto consignado</label>
                <input type="text" inputMode="numeric" value={formatMiles(monto)}
                  onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
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
                className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Registrando…' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
