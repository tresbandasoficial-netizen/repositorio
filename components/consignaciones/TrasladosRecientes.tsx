'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { editarTrasladoAction, eliminarTrasladoAction } from '@/app/actions/traslados'
import { formatCOP, formatFecha, formatMiles } from '@/lib/utils/format'
import { useAviso } from '@/components/ui/Aviso'

export type TrasladoFila = {
  id: string
  fecha: string
  monto: number
  notas: string | null
  origen_cuenta_id: string | null
  destino_cuenta_id: string
  origen: string | null      // nombre de la cuenta origen (null = ingreso externo)
  destino: string
  responsable: string
  vinculado: string | null   // 'préstamo' / 'envío USA' — no editable aquí
}

export type CuentaOpcion = { id: string; nombre: string }

// Últimos traslados/consignaciones con corrección en línea (solo admin —
// la página ya es solo-admin). Pedido de Johan: cuando una consignación se
// registra con la cuenta, el monto o la fecha equivocados, poder corregirla o
// anularla él mismo. El motivo es obligatorio y todo queda en el historial.
export function TrasladosRecientes({ traslados, cuentas }: {
  traslados: TrasladoFila[]
  cuentas: CuentaOpcion[]
}) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [abierto, setAbierto] = useState<string | null>(null)   // id en edición
  const [modo, setModo] = useState<'editar' | 'anular'>('editar')
  const [montoTxt, setMontoTxt] = useState('')
  const [fecha, setFecha] = useState('')
  const [origenId, setOrigenId] = useState<string>('')
  const [destinoId, setDestinoId] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  function abrir(t: TrasladoFila, m: 'editar' | 'anular') {
    setAbierto(t.id)
    setModo(m)
    setMontoTxt(String(t.monto))
    setFecha(t.fecha)
    setOrigenId(t.origen_cuenta_id ?? '')
    setDestinoId(t.destino_cuenta_id)
    setNotas(t.notas ?? '')
    setMotivo('')
    setError(null)
  }

  async function guardar(t: TrasladoFila) {
    setError(null)
    if (!motivo.trim()) { setError('Escribe el motivo — queda en el historial'); return }
    setGuardando(true)
    const r = modo === 'anular'
      ? await eliminarTrasladoAction(t.id, motivo)
      : await editarTrasladoAction(t.id, {
          monto:             parseInt(montoTxt.replace(/\D/g, ''), 10) || 0,
          fecha,
          origen_cuenta_id:  origenId || null,
          destino_cuenta_id: destinoId,
          notas,
          motivo,
        })
    setGuardando(false)
    if (!r.ok) { setError(r.error); avisarError(r.error); return }
    avisar(modo === 'anular' ? 'Traslado anulado' : 'Traslado corregido')
    setAbierto(null)
    router.refresh()
  }

  if (traslados.length === 0) return null

  const inputCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Últimos traslados y consignaciones</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Aquí puedes corregir o anular un movimiento mal registrado (cuenta, monto o fecha). El motivo queda en el historial.
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {traslados.map(t => (
          <div key={t.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-gray-400 w-20 shrink-0">{formatFecha(t.fecha)}</span>
              <span className="text-sm text-gray-800 flex-1 min-w-48">
                <strong>{t.origen ?? 'Ingreso externo'}</strong>
                <span className="text-gray-400"> → </span>
                <strong>{t.destino}</strong>
                {t.notas && <span className="block text-xs text-gray-400 truncate max-w-md">{t.notas}</span>}
              </span>
              <span className="text-xs text-gray-400 w-20 truncate">{t.responsable}</span>
              <span className="font-bold text-gray-900 tabular-nums">{formatCOP(t.monto)}</span>
              {t.vinculado ? (
                <span className="text-[11px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5" title={`Se corrige desde su módulo`}>
                  {t.vinculado}
                </span>
              ) : abierto === t.id ? null : (
                <span className="flex gap-2">
                  <button onClick={() => abrir(t, 'editar')} className="text-xs font-medium text-blue-600 hover:underline">Corregir</button>
                  <button onClick={() => abrir(t, 'anular')} className="text-xs font-medium text-red-600 hover:underline">Anular</button>
                </span>
              )}
            </div>

            {abierto === t.id && (
              <div className="mt-2 rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
                {modo === 'editar' ? (
                  <div className="flex flex-wrap gap-2">
                    <select value={origenId} onChange={e => setOrigenId(e.target.value)} className={inputCls}>
                      <option value="">(Ingreso externo — sin origen)</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <span className="self-center text-gray-400">→</span>
                    <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className={inputCls}>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input inputMode="numeric" value={formatMiles(montoTxt)} onChange={e => setMontoTxt(e.target.value.replace(/\D/g, ''))} className={`${inputCls} w-32`} placeholder="Monto" />
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
                    <input value={notas} onChange={e => setNotas(e.target.value)} className={`${inputCls} flex-1 min-w-40`} placeholder="Notas" />
                  </div>
                ) : (
                  <p className="text-sm text-red-700 font-medium">
                    Se anulará este traslado de {formatCOP(t.monto)}: la cuenta {t.origen ?? '(externa)'} recupera la plata y {t.destino} la pierde en el sistema.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    className={`${inputCls} flex-1 min-w-56`}
                    placeholder="Motivo (obligatorio) — ej. la plata salió del Nequi, no del efectivo"
                  />
                  <button
                    onClick={() => guardar(t)}
                    disabled={guardando}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-bold text-white disabled:opacity-50 ${modo === 'anular' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {guardando ? 'Guardando…' : modo === 'anular' ? 'Anular traslado' : 'Guardar corrección'}
                  </button>
                  <button onClick={() => setAbierto(null)} disabled={guardando} className="text-sm text-gray-500 hover:text-gray-700">
                    Cancelar
                  </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
