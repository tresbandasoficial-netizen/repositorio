'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarPagoAction } from '@/app/actions/pedidos'
import { editarAbonoFacturaAction } from '@/app/actions/facturacion'
import { formatCOP, formatMiles } from '@/lib/utils/format'
import { MetodoPago, metodosDeSede, labelMetodo } from '@/types'
import { Pencil } from 'lucide-react'

// Editor de un pago desde el detalle del pedido (solo admin): monto Y método.
// Funciona tanto para pagos del pedido como para abonos hechos en la factura
// (origen 'factura'); en ambos casos el dinero se re-enruta a la cuenta del
// método nuevo para que el flujo de caja quede cuadrado.
export function EditarPagoInline({ pagoId, monto, metodo, origen, fecha, sedeCodigo }: {
  pagoId: string
  monto: number
  metodo: string
  origen?: 'pedido' | 'factura'
  fecha: string
  sedeCodigo?: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(monto))
  const [metodoSel, setMetodoSel] = useState(metodo)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const router = useRouter()

  // Métodos de la sede del pedido + el método actual (por si es histórico).
  const metodos = Array.from(new Set([metodo as MetodoPago, ...metodosDeSede(sedeCodigo)]))

  function abrir() {
    setValor(String(monto))
    setMetodoSel(metodo)
    setError(null)
    setEditando(true)
  }

  function guardar() {
    const nuevoMonto = parseInt(valor.replace(/\D/g, ''), 10)
    if (!nuevoMonto || nuevoMonto <= 0) { setError('Monto inválido'); return }
    start(async () => {
      setError(null)
      try {
        const r = origen === 'factura'
          ? await editarAbonoFacturaAction(pagoId, { monto: nuevoMonto, metodo: metodoSel as MetodoPago, fecha })
          : await editarPagoAction(pagoId, { monto: nuevoMonto, metodo: metodoSel as MetodoPago })
        if (!r.ok) { setError(r.error); return }
        setEditando(false)
        router.refresh()
      } catch (e) {
        console.error(e)
        setError('Recarga la página e intenta de nuevo')
      }
    })
  }

  if (!editando) {
    // El lápiz hace visible que el pago se puede editar (antes el monto parecía
    // texto normal y nadie encontraba cómo cambiar el método).
    return (
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 font-medium text-gray-900 hover:text-blue-600 transition-colors"
        title="Editar monto y método de pago"
      >
        {formatCOP(monto)}
        <Pencil size={12} className="text-gray-400" />
      </button>
    )
  }

  // En vertical: la columna del monto es angosta y en fila los controles se
  // partían y el OK quedaba escondido (no se podía "editar bien").
  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <select
        value={metodoSel}
        onChange={e => setMetodoSel(e.target.value)}
        className="w-40 rounded-lg border border-blue-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {metodos.map(m => (
          <option key={m} value={m}>{labelMetodo(m as MetodoPago, sedeCodigo)}</option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={formatMiles(valor)}
        onChange={e => setValor(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
        className={`w-40 rounded-lg border px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400' : 'border-gray-300'}`}
      />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setEditando(false)}
          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50">
          ✕
        </button>
        <button type="button" onClick={guardar} disabled={isPending}
          className="text-xs font-bold bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {isPending ? '…' : 'OK'}
        </button>
      </div>
      {error && <span className="max-w-[12rem] text-[10px] text-red-600 text-right">{error}</span>}
    </div>
  )
}
