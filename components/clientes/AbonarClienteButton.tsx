'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { abonarClienteAction } from '@/app/actions/abonos'
import { formatCOP } from '@/lib/utils/format'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS } from '@/types'

export function AbonarClienteButton({
  clienteId,
  deudaTotal,
}: {
  clienteId: string
  deudaTotal: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [pending, start] = useTransition()

  function abrir() {
    setOpen(true)
    setMonto('')
    setError('')
    setExito('')
    setNotas('')
  }

  function cerrar() {
    setOpen(false)
    setError('')
    setExito('')
  }

  function submit() {
    const m = parseInt(monto.replace(/\D/g, ''), 10)
    if (!m || m <= 0) { setError('Ingresa un monto válido'); return }
    if (m > deudaTotal) { setError(`El monto supera la deuda total (${formatCOP(deudaTotal)})`); return }
    setError('')

    start(async () => {
      const r = await abonarClienteAction({ cliente_id: clienteId, monto: m, metodo, cuenta_id: null, notas })
      if (!r.ok) { setError(r.error); return }
      setExito(`✓ Abono de ${formatCOP(r.aplicado)} registrado`)
      setMonto('')
      setNotas('')
      router.refresh()
    })
  }

  if (deudaTotal <= 0) return null

  return (
    <>
      <button
        onClick={abrir}
        className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
      >
        + Añadir abono
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Registrar abono</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Deuda total: <span className="font-semibold text-red-600">{formatCOP(deudaTotal)}</span>
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">

              {/* Monto */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monto *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder={`Máx. ${formatCOP(deudaTotal)}`}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setMonto(String(deudaTotal))}
                  className="mt-1 text-xs text-blue-600 hover:underline"
                >
                  Pagar todo ({formatCOP(deudaTotal)})
                </button>
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago *</label>
                <select
                  value={metodo}
                  onChange={e => setMetodo(e.target.value as MetodoPago)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {METODOS_PAGO.map(m => (
                    <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>
                  ))}
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Ej: transferencia del 23 jun..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {exito && <p className="text-sm text-green-600">{exito}</p>}
            </div>

            {/* Acciones */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={cerrar}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {pending ? 'Registrando...' : 'Registrar abono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
