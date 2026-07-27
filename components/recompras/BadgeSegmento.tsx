import { ClienteSegmentoRfm } from '@/types'

// Un solo lugar define cómo se ve y se llama cada segmento, para que la etiqueta
// sea igual en /recompras, en la ficha del cliente y donde se use después.
export const SEGMENTO_CONFIG: Record<
  ClienteSegmentoRfm,
  { label: string; icono: string; clases: string; queHacer: string }
> = {
  campeon: {
    label: 'Campeón', icono: '🏆',
    clases: 'bg-amber-50 text-amber-800 border-amber-200',
    queHacer: 'Compra seguido y en volumen. Trato VIP: primero en enterarse, descuento exclusivo.',
  },
  leal: {
    label: 'Leal', icono: '⭐',
    clases: 'bg-blue-50 text-blue-800 border-blue-200',
    queHacer: 'Compra seguido. Mantenerlo cerca: cumpleaños, preventas.',
  },
  potencial: {
    label: 'Potencial', icono: '💡',
    clases: 'bg-violet-50 text-violet-800 border-violet-200',
    queHacer: 'Compraba seguido y en volumen, pero se alejó. Es el que más vale reactivar.',
  },
  nuevo: {
    label: 'Nuevo', icono: '🆕',
    clases: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    queHacer: 'Compró hace poco, pocas veces. Buscar la segunda compra.',
  },
  en_riesgo: {
    label: 'En riesgo', icono: '⚠️',
    clases: 'bg-orange-50 text-orange-800 border-orange-200',
    queHacer: 'Se está espaciando. Contactar ya, antes de que se duerma.',
  },
  dormido: {
    label: 'Dormido', icono: '💤',
    clases: 'bg-gray-100 text-gray-700 border-gray-200',
    queHacer: 'Más de 6 meses sin comprar. Campaña de reactivación con oferta.',
  },
  perdido: {
    label: 'Perdido', icono: '❌',
    clases: 'bg-red-50 text-red-800 border-red-200',
    queHacer: 'Se fue y nunca fue frecuente. Bajo esfuerzo.',
  },
}

export function BadgeSegmento({
  segmento, className = '',
}: {
  segmento: ClienteSegmentoRfm
  className?: string
}) {
  const config = SEGMENTO_CONFIG[segmento] ?? SEGMENTO_CONFIG.nuevo

  return (
    <span
      title={config.queHacer}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${config.clases} ${className}`}
    >
      <span aria-hidden="true">{config.icono}</span>
      {config.label}
    </span>
  )
}
