'use client'

import { useState, useTransition } from 'react'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS } from '@/types'
import { registrarPagoAction } from '@/app/actions/pedidos'
import { formatCOP } from '@/lib/utils/format'

const METODOS: { value: MetodoPago; label: string }[] =
  METODOS_PAGO.map(v => ({ value: v, label: METODO_PAGO_LABELS[v] }))

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  pedidoId: string
  total: number
  totalPagado: number
}

export function RegistrarPagoForm({ pedidoId, total, totalPagado }: Props) {
  const saldo = total - totalPagado

  const [monto, setMonto] = useState(saldo.toString())
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [fecha, setFecha] = useState(hoy())
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const montoNum = parseInt(monto.replace(/\D/g, ''), 10)
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido mayor a cero')
      return
    }

    startTransition(async () => {
      const result = await registrarPagoAction(pedidoId, {
        monto: montoNum,
        metodo,
        fecha,
        notas,
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Resumen financiero */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 rounded-lg text-center">
        <div>
          <p className="text-xs text-gray-500 mb-1">Total pedido</p>
          <p className="text-sm font-semibold text-gray-900">{formatCOP(total)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Total pagado</p>
          <p className="text-sm font-semibold text-green-700">{formatCOP(totalPagado)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Saldo pendiente</p>
          <p className={`text-sm font-bold ${saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {saldo > 0 ? formatCOP(saldo) : 'Pagado'}
          </p>
        </div>
      </div>

      {saldo === 0 && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
          Este pedido ya está totalmente pagado.
        </p>
      )}

      {/* Monto */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Monto a registrar <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            min={1}
            max={saldo}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-full pl-7 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={saldo.toString()}
          />
        </div>
        {saldo > 0 && (
          <button
            type="button"
            onClick={() => setMonto(saldo.toString())}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Usar saldo completo ({formatCOP(saldo)})
          </button>
        )}
      </div>

      {/* Método */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Método de pago <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METODOS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMetodo(m.value)}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                metodo === m.value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fecha */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Fecha del pago <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notas <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Referencia de transferencia, observación, etc."
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending || saldo === 0}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? 'Registrando...' : 'Registrar pago'}
        </button>
        <a
          href={`/pedidos/${pedidoId}`}
          className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}
