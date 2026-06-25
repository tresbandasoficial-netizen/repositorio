'use client'

import { useState, useTransition, useEffect } from 'react'
import { registrarPagoFacturaAction } from '@/app/actions/facturacion'
import { getCuentasAction } from '@/app/actions/cuentas'
import { Button } from '@/components/ui/Button'
import { formatCOP, hoyBogota } from '@/lib/utils/format'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS, MENSAJERIA_LABELS, TipoMensajeria } from '@/types'
import type { Cuenta } from '@/types'

// Métodos estándar (cuenta bancaria / efectivo) + Recaudo Mensajería al final.
const METODOS: { value: MetodoPago; label: string }[] = [
  ...METODOS_PAGO.map(v => ({ value: v, label: METODO_PAGO_LABELS[v] })),
  { value: 'recaudo_mensajeria' as MetodoPago, label: METODO_PAGO_LABELS['recaudo_mensajeria'] },
]

export function RegistrarPagoFacturaForm({ facturaId, saldo }: { facturaId: string; saldo: number }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [fecha, setFecha] = useState(() => hoyBogota())
  const [notas, setNotas] = useState('')
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState('')
  const [mensajeria, setMensajeria] = useState<TipoMensajeria>('servigo')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const esRecaudo = metodo === 'recaudo_mensajeria'

  useEffect(() => {
    getCuentasAction().then(lista => {
      setCuentas(lista)
      if (lista.length > 0) setCuentaId(lista[0].id)
    })
  }, [])

  function submit() {
    const m = parseInt(monto.replace(/\D/g, ''), 10)
    if (!m || m <= 0) { setError('Ingresa un monto válido'); return }
    if (m > saldo) { setError(`El monto supera el saldo (${formatCOP(saldo)})`); return }
    if (metodo !== 'efectivo' && !esRecaudo && !cuentaId) { setError('Selecciona la cuenta destino'); return }
    setError('')
    start(async () => {
      const r = await registrarPagoFacturaAction({
        factura_id: facturaId,
        monto: m,
        metodo,
        fecha,
        notas,
        cuenta_id: (esRecaudo || metodo === 'efectivo') ? null : cuentaId,
        mensajeria: esRecaudo ? mensajeria : null,
      })
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Método *</label>
          <select
            value={metodo}
            onChange={e => setMetodo(e.target.value as MetodoPago)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {esRecaudo ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mensajería que recauda *</label>
            <select
              value={mensajeria}
              onChange={e => setMensajeria(e.target.value as TipoMensajeria)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(MENSAJERIA_LABELS) as TipoMensajeria[]).map(m => (
                <option key={m} value={m}>{MENSAJERIA_LABELS[m]}</option>
              ))}
            </select>
          </div>
        ) : metodo !== 'efectivo' ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta destino *</label>
            <select
              value={cuentaId}
              onChange={e => setCuentaId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {cuentas.length === 0 && <option value="">Cargando...</option>}
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        ) : null}
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

      {esRecaudo && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          🛵 La factura queda saldada, pero la mensajería le debe este valor a TB. Aparecerá en el cuadre de {MENSAJERIA_LABELS[mensajeria]}.
        </p>
      )}

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
