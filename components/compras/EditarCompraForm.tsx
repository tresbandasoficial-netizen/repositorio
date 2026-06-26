'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarCompraAction, EditarCompraInput } from '@/app/actions/compras'
import { formatCOP } from '@/lib/utils/format'

type CuentaOpc = { id: string; nombre: string }

interface Props {
  compraId: string
  inicial: {
    tipo: 'usa' | 'colombia'
    proveedor: string
    fecha: string
    numero_factura: string
    total_usd: number | null
    trm: number | null
    total_cop: number
    notas: string
    cuenta_id: string | null
  }
  cuentas: CuentaOpc[]
}

export function EditarCompraForm({ compraId, inicial, cuentas }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState(inicial.tipo)
  const [proveedor, setProveedor] = useState(inicial.proveedor)
  const [numeroFactura, setNumeroFactura] = useState(inicial.numero_factura)
  const [fecha, setFecha] = useState(inicial.fecha)
  const [totalUsd, setTotalUsd] = useState(inicial.total_usd?.toString() ?? '')
  const [totalCopPagado, setTotalCopPagado] = useState(inicial.total_cop.toString())
  const [subtotalUsd, setSubtotalUsd] = useState('')
  const [impuestosUsd, setImpuestosUsd] = useState('')
  const [envioUsd, setEnvioUsd] = useState('')
  const [notas, setNotas] = useState(inicial.notas)
  const [cuentaId, setCuentaId] = useState(inicial.cuenta_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const totalCopNum = parseInt(totalCopPagado.replace(/\D/g, ''), 10) || 0
  const trmCalculada = tipo === 'usa' && totalUsd && totalCopPagado
    ? Math.round(parseFloat(totalCopPagado.replace(/\D/g, '')) / parseFloat(totalUsd))
    : null

  function handleGuardar() {
    setError(null)
    if (!proveedor.trim()) { setError('El proveedor es obligatorio'); return }
    if (tipo === 'usa' && (!totalUsd || parseFloat(totalUsd) <= 0)) { setError('Total USD es obligatorio'); return }
    if (!totalCopPagado || totalCopNum <= 0) { setError('Total COP es obligatorio'); return }

    const payload: EditarCompraInput = {
      tipo,
      proveedor: proveedor.trim(),
      fecha,
      numero_factura: numeroFactura.trim(),
      total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
      trm: tipo === 'usa' ? (trmCalculada ?? null) : null,
      total_cop: totalCopNum,
      notas,
      cuenta_id: cuentaId || null,
    }

    startSaving(async () => {
      const result = await editarCompraAction(compraId, payload)
      if (!result.ok) { setError(result.error); return }
      router.push(`/compras/${compraId}`)
      router.refresh()
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Tipo */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tipo de factura</label>
        <div className="flex gap-2">
          {(['usa', 'colombia'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                tipo === t
                  ? t === 'usa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}>
              {t === 'usa' ? 'Dólares (USD)' : 'Pesos (COP)'}
            </button>
          ))}
        </div>
      </div>

      {/* Proveedor + N° Factura + Fecha */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Proveedor *</label>
          <input type="text" value={proveedor} onChange={e => setProveedor(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Factura</label>
          <input type="text" value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} placeholder="INV-12345" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fecha *</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Montos */}
      {tipo === 'usa' ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total USD *</label>
            <input type="number" min="0" step="0.01" value={totalUsd} onChange={e => setTotalUsd(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP pagado *</label>
            <input type="text" inputMode="numeric" value={totalCopPagado}
              onChange={e => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
              placeholder="0" className={inputCls} />
            {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">TRM calculada</label>
            <div className={`${inputCls} bg-gray-50 text-gray-700 font-medium`}>
              {trmCalculada ? `$${trmCalculada.toLocaleString('es-CO')}` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP *</label>
          <input type="text" inputMode="numeric" value={totalCopPagado}
            onChange={e => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
            placeholder="0" className={inputCls} />
          {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
        </div>
      )}

      {/* Cuenta de pago */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cuenta de pago</label>
        <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={inputCls}>
          <option value="">— Sin especificar (no descuenta saldo) —</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {cuentaId && (
          <p className="text-xs text-green-700 mt-1">
            Se registrará un egreso de {formatCOP(totalCopNum)} en esta cuenta
          </p>
        )}
        {!cuentaId && (
          <p className="text-xs text-gray-400 mt-1">
            Selecciona una cuenta para que el gasto se refleje en el flujo de caja
          </p>
        )}
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notas</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
          placeholder="Observaciones sobre la compra..."
          className={`${inputCls} resize-none`} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3">
        <button onClick={handleGuardar} disabled={isSaving}
          className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={() => router.push(`/compras/${compraId}`)}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
