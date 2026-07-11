'use client'

import { useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

export function ClientesBusqueda({ valorInicial }: { valorInicial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // Preservar los demás filtros (p. ej. sede); reiniciar la paginación.
      const params = new URLSearchParams(searchParams.toString())
      if (valor) params.set('q', valor)
      else params.delete('q')
      params.delete('pagina')
      router.replace(`${pathname}?${params.toString()}`)
    }, 400)
  }

  return (
    <div className="relative max-w-sm">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        key={valorInicial}
        type="search"
        defaultValue={valorInicial}
        onChange={handleChange}
        placeholder="Buscar por nombre o teléfono…"
        className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
