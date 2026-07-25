'use client'

import { ClienteSegmentoRfm } from '@/types'

const segmentConfig: Record<ClienteSegmentoRfm, { label: string; bg: string; text: string; icon: string }> = {
  campeon: { label: '🏆 Campeón', bg: 'bg-yellow-50', text: 'text-yellow-800', icon: '🏆' },
  leal: { label: '⭐ Leal', bg: 'bg-blue-50', text: 'text-blue-800', icon: '⭐' },
  potencial: { label: '💡 Potencial', bg: 'bg-purple-50', text: 'text-purple-800', icon: '💡' },
  nuevo: { label: '🆕 Nuevo', bg: 'bg-green-50', text: 'text-green-800', icon: '🆕' },
  en_riesgo: { label: '⚠️ En Riesgo', bg: 'bg-orange-50', text: 'text-orange-800', icon: '⚠️' },
  dormido: { label: '💤 Dormido', bg: 'bg-gray-50', text: 'text-gray-800', icon: '💤' },
  perdido: { label: '❌ Perdido', bg: 'bg-red-50', text: 'text-red-800', icon: '❌' },
}

export function BadgeSegmento({ segmento, className = '' }: { segmento: ClienteSegmentoRfm; className?: string }) {
  const config = segmentConfig[segmento]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      {config.icon}
      {config.label}
    </span>
  )
}
