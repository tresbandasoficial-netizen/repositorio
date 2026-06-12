'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cerrarCuadreDiaAction } from '@/app/actions/domicilios'
import type { CuadreDia, CierreDia } from '@/lib/queries/domicilios'

interface Props {
  fecha: string
  cierre: CierreDia
  cuadre: CuadreDia
}

export function CuadreDiaCierreBotones({ fecha, cierre, cuadre }: Props) {
  const [isPending, start] = useTransition()
  const router = useRouter()

  function cerrar() {
    if (!confirm('¿Cerrar el cuadre de este día? Quedará registrado como cuadrado.')) return
    start(async () => {
      await cerrarCuadreDiaAction(fecha, cuadre.total_neto, {
        por_mensajeria: cuadre.por_mensajeria,
        total_domicilios: cuadre.total_domicilios,
      })
      router.refresh()
    })
  }

  if (cierre) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span className="text-green-600 text-sm font-semibold">✓ Cuadrado</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={cerrar}
      disabled={isPending || cuadre.total_domicilios === 0}
      className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
    >
      {isPending ? 'Cerrando...' : 'Cerrar día'}
    </button>
  )
}
