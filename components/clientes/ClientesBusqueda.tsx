'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Search } from 'lucide-react'

export function ClientesBusqueda({ valorInicial }: { valorInicial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value
    startTransition(() => {
      const params = new URLSearchParams()
      if (valor) params.set('q', valor)
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="relative max-w-sm">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        defaultValue={valorInicial}
        onChange={handleChange}
        placeholder="Buscar por nombre o teléfono…"
        className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          …
        </span>
      )}
    </div>
  )
}
