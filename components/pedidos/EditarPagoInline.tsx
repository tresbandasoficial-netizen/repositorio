'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarPagoAction } from '@/app/actions/pedidos'
import { formatCOP } from '@/lib/utils/format'

export function EditarPagoInline({ pagoId, monto }: { pagoId: string; monto: number }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(monto))
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const router = useRouter()

  function abrir() {
    setValor(String(monto))
    setError(null)
    setEditando(true)
  }

  function cancelar() {
    setEditando(false)
    setError(null)
  }

  function guardar() {
    const nuevoMonto = parseInt(valor.replace(/\D/g, ''), 10)
    if (!nuevoMonto || nuevoMonto <= 0) { setError('Monto inválido'); return }
    start(async () => {
      const r = await editarPagoAction(pagoId, nuevoMonto)
      if (!r.ok) { setError(r.error); return }
      setEditando(false)
      router.refresh()
    })
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors"
        title="Editar monto"
      >
        {formatCOP(monto)}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={valor}
        onChange={e => setValor(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
        className={`w-28 rounded border px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400' : 'border-gray-300'}`}
      />
      <button type="button" onClick={guardar} disabled={isPending}
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-60">
        {isPending ? '…' : 'OK'}
      </button>
      <button type="button" onClick={cancelar} className="text-xs text-gray-400 hover:text-gray-600 px-1">
        ✕
      </button>
    </div>
  )
}
