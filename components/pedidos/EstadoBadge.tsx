import { EstadoPedido, ESTADO_LABELS, ESTADO_COLORES } from '@/types'
import { cn } from '@/lib/utils/cn'

interface EstadoBadgeProps {
  estado: EstadoPedido
  enAlerta?: boolean
}

export function EstadoBadge({ estado, enAlerta = false }: EstadoBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', ESTADO_COLORES[estado])}>
        {ESTADO_LABELS[estado]}
      </span>
      {enAlerta && (
        <span title="Tiempo en este estado superó el umbral" className="text-red-500 text-sm leading-none">
          ⚠
        </span>
      )}
    </span>
  )
}
