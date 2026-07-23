'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// Botón de "volver atrás" del sistema: grande y con forma de botón. Vuelve a
// la PÁGINA ANTERIOR real (con sus filtros y su posición), igual que la
// flecha del navegador; solo usa la ruta fija `href` cuando se entró directo
// por un enlace (sin historial en la app).
export function BotonVolver({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()

  function volver(e: React.MouseEvent) {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
    // sin historial: deja que el Link navegue a href
  }

  return (
    <Link
      href={href}
      onClick={volver}
      className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm transition-colors"
    >
      <ArrowLeft size={16} />
      <span>{children}</span>
    </Link>
  )
}
