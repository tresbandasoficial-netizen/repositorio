'use client'

import { MessageCircle } from 'lucide-react'
import { formatCOP } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { EstadoPedido } from '@/types'

// Aviso al cliente de que su pedido ya llegó a la tienda.
//
// Solo aparece cuando el pedido está EN BUCARAMANGA (ahí ya está la mercancía
// en la tienda y se le puede avisar). El mensaje se abre YA ESCRITO en WhatsApp
// —web en el computador, la app en el celular—; enviarlo es manual, porque
// WhatsApp no permite enviar un mensaje desde un enlace.

export function mensajeLlego(saldo: number): string {
  const base =
    'Hola, ¿cómo estás? Queremos avisarte que ya tenemos tu pedido, ' +
    'quedamos atentos a la confirmación para enviarte.'
  return saldo > 0 ? `${base}\n\nAún tenemos un saldo de: ${formatCOP(saldo)}` : base
}

export function AvisarLlegoButton({
  estado,
  telefono,
  saldo,
  variante = 'chip',
  className,
}: {
  estado: EstadoPedido
  telefono: string
  saldo: number
  variante?: 'chip' | 'ancho'
  className?: string
}) {
  if (estado !== 'bucaramanga') return null

  const numero = (telefono ?? '').replace(/\D/g, '')
  if (!numero) return null

  function avisar(e: React.MouseEvent) {
    // La fila/tarjeta que lo contiene navega al pedido: el clic no debe subir
    e.preventDefault()
    e.stopPropagation()
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensajeLlego(saldo))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={avisar}
      title="Avisar al cliente por WhatsApp que su pedido ya llegó"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-bold shrink-0 transition-colors',
        'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white',
        variante === 'ancho'
          ? 'w-full text-sm rounded-xl py-2.5'
          : 'text-[11px] rounded-full px-2.5 py-1',
        className,
      )}
    >
      <MessageCircle size={variante === 'ancho' ? 15 : 12} />
      Avisar
    </button>
  )
}
