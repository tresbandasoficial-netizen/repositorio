'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarSeguimientoAction, Seguimiento } from '@/app/actions/clientes'
import { useAviso } from '@/components/ui/Aviso'
import { formatFecha } from '@/lib/utils/format'

export const SEMAFORO: Record<Seguimiento, { punto: string; label: string; ayuda: string; clases: string }> = {
  verde: {
    punto: '🟢', label: 'Respondió',
    ayuda: 'Contestó, está interesado o ya compró',
    clases: 'bg-emerald-600 border-emerald-700 text-white',
  },
  naranja: {
    punto: '🟠', label: 'Esperando',
    ayuda: 'Le escribí y todavía no contesta',
    clases: 'bg-orange-500 border-orange-600 text-white',
  },
  rojo: {
    punto: '🔴', label: 'No responde',
    ayuda: 'No contesta o dijo que no',
    clases: 'bg-red-600 border-red-700 text-white',
  },
}

export function SemaforoSeguimiento({
  clienteId, actual, nota, marcadoEn, marcadoPor, soloLectura = false,
}: {
  clienteId: string
  actual: Seguimiento | null
  nota: string | null
  marcadoEn: string | null
  marcadoPor: string | null
  soloLectura?: boolean
}) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [texto, setTexto] = useState(nota ?? '')
  const [pending, start] = useTransition()

  function marcar(valor: Seguimiento | null) {
    start(async () => {
      const r = await marcarSeguimientoAction(clienteId, valor, texto)
      if (!r.ok) { avisarError(r.error); return }
      avisar(valor ? `Marcado ${SEMAFORO[valor].label.toLowerCase()}` : 'Marca quitada')
      router.refresh()
    })
  }

  if (soloLectura) {
    return actual ? (
      <p className="text-sm text-gray-600">
        <span aria-hidden="true">{SEMAFORO[actual].punto}</span> {SEMAFORO[actual].label}
        {nota && <span className="text-gray-400"> — {nota}</span>}
      </p>
    ) : null
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Seguimiento</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Cómo va el contacto con este cliente. Lo marcas tú; no lo calcula el sistema.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SEMAFORO) as Seguimiento[]).map(valor => {
          const cfg = SEMAFORO[valor]
          const activo = actual === valor
          return (
            <button
              key={valor}
              type="button"
              onClick={() => marcar(valor)}
              disabled={pending}
              title={cfg.ayuda}
              aria-pressed={activo}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                activo ? cfg.clases : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span aria-hidden="true">{cfg.punto}</span>
              {cfg.label}
            </button>
          )
        })}
        {actual && (
          <button
            type="button"
            onClick={() => marcar(null)}
            disabled={pending}
            className="rounded-lg px-2.5 py-1.5 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>

      <div>
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onBlur={() => { if (actual && texto !== (nota ?? '')) marcar(actual) }}
          placeholder="Nota: qué dijo, cuándo volver a escribirle…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {actual && marcadoEn && (
          <p className="text-xs text-gray-400 mt-1.5">
            Marcado el {formatFecha(marcadoEn)}
            {marcadoPor ? ` por ${marcadoPor}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
