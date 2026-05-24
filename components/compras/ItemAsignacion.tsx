'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AsignarItemForm } from './AsignarItemForm'
import { Badge } from '@/components/ui/Badge'

type Destino = 'pedido' | 'contoda' | 'sin_asignar'

interface ItemAsignacionProps {
  itemId: string
  destino: Destino
  pedidoNumeroOrden: string | null
}

const DESTINO_LABELS: Record<Destino, string> = {
  sin_asignar: 'Sin asignar',
  pedido: 'Pedido',
  contoda: 'Contoda',
}

const DESTINO_COLORES: Record<Destino, string> = {
  sin_asignar: 'bg-gray-100 text-gray-600',
  pedido: 'bg-blue-100 text-blue-800',
  contoda: 'bg-purple-100 text-purple-800',
}

export function ItemAsignacion({ itemId, destino, pedidoNumeroOrden }: ItemAsignacionProps) {
  const [abierto, setAbierto] = useState(false)
  const router = useRouter()

  function handleDone() {
    setAbierto(false)
    router.refresh()
  }

  if (abierto) {
    return (
      <div className="mt-2">
        <AsignarItemForm
          itemId={itemId}
          destinoActual={destino}
          pedidoActual={pedidoNumeroOrden}
          onDone={handleDone}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className={DESTINO_COLORES[destino]}>
        {DESTINO_LABELS[destino]}
      </Badge>
      {destino === 'pedido' && pedidoNumeroOrden && (
        <span className="text-xs font-mono text-gray-600">{pedidoNumeroOrden}</span>
      )}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        Cambiar
      </button>
    </div>
  )
}
