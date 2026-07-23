import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Botón de "volver atrás" del sistema: grande y con forma de botón (no un
// simple texto con flecha). Se usa en el encabezado de todas las páginas de
// detalle/edición.
export function BotonVolver({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm transition-colors"
    >
      <ArrowLeft size={16} />
      <span>{children}</span>
    </Link>
  )
}
