'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guardarLimiteConsignacionAction } from '@/app/actions/consignaciones'
import { LIMITE_CONSIGNACION_DEFECTO } from '@/lib/consignaciones'
import { useAviso } from '@/components/ui/Aviso'
import { formatCOP, formatMiles, formatFecha } from '@/lib/utils/format'

export type CuentaConsignacion = {
  cuenta_id: string
  nombre: string
  tipo: string
  titular: string | null
  limite_consignacion: number | null
  consignado: number
  movimientos: number
  ultima_consignacion: string | null
}

// Umbrales del semáforo. 80% avisa con tiempo para mover los cobros a otra
// cuenta; 95% ya es urgente.
export function nivelDe(consignado: number, limite: number) {
  const pct = limite > 0 ? (consignado / limite) * 100 : 0
  if (pct >= 100) return 'pasado' as const
  if (pct >= 95) return 'critico' as const
  if (pct >= 80) return 'alerta' as const
  return 'ok' as const
}

const COLORES = {
  pasado:  { barra: 'bg-red-600',     texto: 'text-red-700',     fondo: 'bg-red-50 border-red-300' },
  critico: { barra: 'bg-red-500',     texto: 'text-red-700',     fondo: 'bg-red-50 border-red-200' },
  alerta:  { barra: 'bg-amber-500',   texto: 'text-amber-700',   fondo: 'bg-amber-50 border-amber-200' },
  ok:      { barra: 'bg-emerald-500', texto: 'text-emerald-700', fondo: 'bg-white border-gray-200' },
}

export function FilaCuenta({ cuenta }: { cuenta: CuentaConsignacion }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [editando, setEditando] = useState(false)
  const [limite, setLimite] = useState(cuenta.limite_consignacion ? String(cuenta.limite_consignacion) : '')
  const [titular, setTitular] = useState(cuenta.titular ?? '')
  const [pending, start] = useTransition()

  const limiteEfectivo = cuenta.limite_consignacion ?? LIMITE_CONSIGNACION_DEFECTO
  const nivel = nivelDe(cuenta.consignado, limiteEfectivo)
  const color = COLORES[nivel]
  const pct = limiteEfectivo > 0 ? (cuenta.consignado / limiteEfectivo) * 100 : 0
  const restante = limiteEfectivo - cuenta.consignado

  function guardar() {
    start(async () => {
      const n = parseInt(limite.replace(/\D/g, ''), 10)
      const r = await guardarLimiteConsignacionAction(cuenta.cuenta_id, Number.isFinite(n) && n > 0 ? n : null, titular)
      if (!r.ok) { avisarError(r.error); return }
      avisar('Cambio realizado')
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <div className={`rounded-xl border p-4 ${color.fondo}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-gray-900">{cuenta.nombre}</span>
        {cuenta.titular && (
          <span className="text-xs text-gray-500">titular: {cuenta.titular}</span>
        )}
        <div className="flex-1" />
        <span className={`text-sm font-bold tabular-nums ${color.texto}`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Barra de avance contra el tope */}
      <div
        className="mt-2 h-2.5 w-full rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${cuenta.nombre}: ${pct.toFixed(1)}% del tope`}
      >
        <div className={`h-full rounded-full ${color.barra}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="font-bold text-gray-900 tabular-nums">{formatCOP(cuenta.consignado)}</span>
        <span className="text-gray-400">de {formatCOP(limiteEfectivo)}</span>
        <span className={`font-semibold tabular-nums ${restante < 0 ? 'text-red-700' : color.texto}`}>
          {restante < 0
            ? `pasado por ${formatCOP(Math.abs(restante))}`
            : `quedan ${formatCOP(restante)}`}
        </span>
      </div>

      <p className="mt-1 text-xs text-gray-400">
        {cuenta.movimientos} {cuenta.movimientos === 1 ? 'consignación' : 'consignaciones'}
        {cuenta.ultima_consignacion && ` · última el ${formatFecha(cuenta.ultima_consignacion)}`}
        {cuenta.limite_consignacion == null && ' · tope general'}
      </p>

      {editando ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Titular</label>
            <input
              type="text"
              value={titular}
              onChange={e => setTitular(e.target.value)}
              placeholder="Nombre de quien es la cuenta"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">Tope propio (vacío = general)</label>
            <input
              type="text"
              inputMode="numeric"
              value={formatMiles(limite)}
              onChange={e => setLimite(e.target.value.replace(/\D/g, ''))}
              placeholder={formatMiles(String(LIMITE_CONSIGNACION_DEFECTO))}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          Cambiar titular o tope
        </button>
      )}
    </div>
  )
}
