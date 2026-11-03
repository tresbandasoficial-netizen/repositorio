'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { generarAuditoriaAction } from '@/app/actions/auditoria'

// Genera o actualiza el informe de un día. Solo lee y guarda el informe.
export function GenerarAuditoriaButton({ sede, fecha, etiqueta }: { sede: string; fecha?: string; etiqueta: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-1">
      <button
        onClick={() => start(async () => {
          setError(null)
          const r = await generarAuditoriaAction(sede, fecha)
          if (!r.ok) { setError(r.error); return }
          router.refresh()
        })}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
        {pending ? 'Auditando…' : etiqueta}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
