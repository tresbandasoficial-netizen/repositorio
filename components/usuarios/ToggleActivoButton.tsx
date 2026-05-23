'use client'

import { useTransition } from 'react'
import { toggleActivoAction } from '@/app/actions/usuarios'

interface Props {
  usuarioId: string
  activo: boolean
  esMismoUsuario: boolean
}

export function ToggleActivoButton({ usuarioId, activo, esMismoUsuario }: Props) {
  const [isPending, startTransition] = useTransition()

  if (esMismoUsuario) {
    return <span className="text-xs text-gray-400">Tu cuenta</span>
  }

  function handleClick() {
    startTransition(async () => {
      await toggleActivoAction(usuarioId, !activo)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
        activo
          ? 'border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
          : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
      }`}
    >
      {isPending ? '...' : activo ? 'Desactivar' : 'Activar'}
    </button>
  )
}
