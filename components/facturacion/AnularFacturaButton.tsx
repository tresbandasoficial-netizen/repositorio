'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anularFacturaAction } from '@/app/actions/facturacion'
import { Button } from '@/components/ui/Button'

export function AnularFacturaButton({ facturaId }: { facturaId: string }) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function anular() {
    setError('')
    start(async () => {
      const r = await anularFacturaAction(facturaId)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  if (!confirmar) {
    return (
      <Button variant="ghost" onClick={() => setConfirmar(true)} className="text-red-600">
        Anular factura
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <p className="text-xs text-gray-500">¿Anular esta factura? Los pedidos quedarán sin facturar.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setConfirmar(false)} disabled={pending}>Cancelar</Button>
        <Button variant="danger" onClick={anular} disabled={pending}>
          {pending ? 'Anulando…' : 'Sí, anular'}
        </Button>
      </div>
    </div>
  )
}
