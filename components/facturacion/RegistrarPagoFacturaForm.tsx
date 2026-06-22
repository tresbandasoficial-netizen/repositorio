'use client'

import { useState, useTransition, useEffect } from 'react'
import { registrarPagoFacturaAction } from '@/app/actions/facturacion'
import { getCuentasAction } from '@/app/actions/cuentas'
import { Button } from '@/components/ui/Button'
import { formatCOP } from '@/lib/utils/format'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS } from '@/types'
import type { Cuenta } from '@/types'

const METODOS: { value: MetodoPago; label: string }[] =
  METODOS_PAGO.map(v => ({ value: v, label: METODO_PAGO_LABELS[v] }))

export function RegistrarPagoFacturaForm({ facturaId, saldo }: { facturaId: string; saldo: number }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [cuentaId, setCuentaId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [pending, start] = useTransition()

  useEffect(() => {
    getCuentasAction().then(r => {
      if (r.ok) setCuentas(r.cuentas)
    })
  }, [])

  function submit() {
    const m = parseInt(monto.replace(/\D/g, ''), 10)
    if (!m || m <= 0) { setError('Ingresa un monto válido'); return }
    if (m > saldo) { setError(`El monto supera el saldo (${formatCOP(saldo)})`); return }
    if (!cuentaId) { setError('Selecciona una cuenta destino'); return }
    setError('')
    start(async () => {
      const r = await registrarPagoFacturaAction({ factura_id: facturaId, monto: m, metodo, cuenta_id: cuentaId, fecha, notas })
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
          <input
            type="text"
            inputMode="numeric"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder={`Saldo: ${formatCOP(saldo)}`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta destino *</label>
          <select
            value={cuentaId}
            onChange={e => setCuentaId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecciona una cuenta</option>
            {cuentas.filter(c => c.estado === 'activa').map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Método</label>
          <select
            value={metodo}
            onChange={e => setMetodo(e.target.value as MetodoPago)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional)</label>
          <input
            type="text"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? 'Registrando…' : 'Registrar abono'}
        </Button>
        <Button variant="secondary" onClick={() => setMonto(String(saldo))} disabled={pending}>
          Pagar todo
        </Button>
      </div>
    </div>
  )
}
