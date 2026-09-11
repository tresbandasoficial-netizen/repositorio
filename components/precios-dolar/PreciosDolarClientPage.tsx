'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatCOP, formatFechaHora, formatMiles } from '@/lib/utils/format'
import {
  precioEnPesos,
  CategoriaPrecioDolar,
  CATEGORIA_PRECIO_DOLAR_LABELS,
} from '@/lib/utils/precios-dolar'
import {
  guardarTrmAction,
  crearPrecioDolarAction,
  editarPrecioDolarAction,
  eliminarPrecioDolarAction,
} from '@/app/actions/precios-dolar'

export type PrecioDolarRow = {
  id: string
  tipo_articulo: string
  valor_usd: number
  categoria: CategoriaPrecioDolar
}

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
}

// Precios dólar: la TRM del día (editable solo por el admin) y la tabla
// tipo de artículo → valor USD → valor en pesos. La fórmula (tax + ganancia
// por categoría) vive en lib/utils/precios-dolar y SOLO se muestra al admin:
// los asesores ven el precio final sin saber cómo se calcula.
export function PreciosDolarClientPage({
  precios,
  trm,
  trmActualizadaEn,
  esAdmin,
}: {
  precios: PrecioDolarRow[]
  trm: number
  trmActualizadaEn: string | null
  esAdmin: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [guardando, start] = useTransition()

  // TRM (solo admin edita)
  const [editandoTrm, setEditandoTrm] = useState(false)
  const [trmInput, setTrmInput] = useState('')

  // Agregar precio (solo admin)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [nuevoUsd, setNuevoUsd] = useState('')
  const [nuevoCat, setNuevoCat] = useState<'' | CategoriaPrecioDolar>('')

  // Editar precio en la fila (solo admin)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editTipo, setEditTipo] = useState('')
  const [editUsd, setEditUsd] = useState('')
  const [editCat, setEditCat] = useState<CategoriaPrecioDolar>('prendas')

  function guardarTrm() {
    setError(null)
    const valor = parseInt(trmInput.replace(/\D/g, ''), 10) || 0
    start(async () => {
      const r = await guardarTrmAction(valor)
      if (!r.ok) { setError(r.error); return }
      setEditandoTrm(false)
      router.refresh()
    })
  }

  function agregar() {
    if (!nuevoCat) { setError('Selecciona la categoría'); return }
    setError(null)
    const valor_usd = parseFloat(nuevoUsd.replace(',', '.')) || 0
    start(async () => {
      const r = await crearPrecioDolarAction({ tipo_articulo: nuevoTipo, valor_usd, categoria: nuevoCat })
      if (!r.ok) { setError(r.error); return }
      setNuevoTipo(''); setNuevoUsd(''); setNuevoCat('')
      router.refresh()
    })
  }

  function guardarEdicion(id: string) {
    setError(null)
    const valor_usd = parseFloat(editUsd.replace(',', '.')) || 0
    start(async () => {
      const r = await editarPrecioDolarAction(id, { tipo_articulo: editTipo, valor_usd, categoria: editCat })
      if (!r.ok) { setError(r.error); return }
      setEditandoId(null)
      router.refresh()
    })
  }

  function eliminar(p: PrecioDolarRow) {
    if (!confirm(`¿Eliminar "${p.tipo_articulo}" de la lista de precios?`)) return
    setError(null)
    start(async () => {
      const r = await eliminarPrecioDolarAction(p.id)
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  const nuevoUsdNum = parseFloat(nuevoUsd.replace(',', '.')) || 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Precios dólar</h1>
        {/* La fórmula es información solo del admin; el asesor ve el precio final. */}
        <p className="text-sm text-gray-500 mt-0.5">
          {esAdmin
            ? 'Todo lleva +7% tax × dólar · Zapatos: +$250.000 hasta $1.000.000, +30% si pasa del millón · Camisas y prendas: +40%'
            : 'Valor de los artículos en dólares y su precio en pesos'}
        </p>
      </div>

      {/* TRM del día */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <DollarSign size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Valor del dólar</p>
            {editandoTrm ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text" inputMode="numeric" autoFocus
                  value={formatMiles(trmInput)}
                  onChange={e => setTrmInput(e.target.value)}
                  placeholder="Ej: 4.200"
                  className="w-32 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={guardarTrm}
                  disabled={guardando || !(parseInt(trmInput.replace(/\D/g, ''), 10) > 0)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                <button onClick={() => setEditandoTrm(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <p className="text-lg font-bold text-gray-900">
                {trm > 0 ? formatCOP(trm) : '—'}
                {trmActualizadaEn && (
                  <span className="ml-2 text-[11px] font-normal text-gray-400">
                    actualizado {formatFechaHora(trmActualizadaEn)}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {esAdmin && !editandoTrm && (
          <button
            onClick={() => { setTrmInput(String(trm || '')); setEditandoTrm(true) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil size={14} /> Actualizar dólar
          </button>
        )}
      </div>

      {/* Agregar precio (solo admin) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Agregar tipo de artículo</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text" value={nuevoTipo}
              onChange={e => setNuevoTipo(e.target.value)}
              placeholder="Tipo de artículo — Ej: Tenis, Gorra, Camiseta…"
              className="sm:col-span-2 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={nuevoCat}
              onChange={e => setNuevoCat(e.target.value as '' | CategoriaPrecioDolar)}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Categoría…</option>
              <option value="zapatos">{CATEGORIA_PRECIO_DOLAR_LABELS.zapatos}</option>
              <option value="prendas">{CATEGORIA_PRECIO_DOLAR_LABELS.prendas}</option>
            </select>
            <input
              type="text" inputMode="decimal" value={nuevoUsd}
              onChange={e => setNuevoUsd(e.target.value)}
              placeholder="Valor en dólares (USD)"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {nuevoUsdNum > 0 && trm > 0 && nuevoCat && (
            <p className="text-xs text-gray-500">
              {formatUSD(nuevoUsdNum)} quedaría en <span className="font-bold text-gray-900">{formatCOP(precioEnPesos(nuevoUsdNum, trm, nuevoCat))}</span>
            </p>
          )}
          <button
            onClick={agregar}
            disabled={guardando || !nuevoTipo.trim() || !nuevoCat || !(nuevoUsdNum > 0)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Plus size={15} /> {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Tabla de precios */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {precios.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            Aún no hay precios registrados{esAdmin ? '. Agrega el primero arriba.' : '.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-2.5">Tipo de artículo</th>
                <th className="text-right px-3 py-2.5">Valor en dólares</th>
                <th className="text-right px-5 py-2.5">Valor en pesos</th>
                {esAdmin && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {precios.map(p => {
                const editando = editandoId === p.id
                const editUsdNum = parseFloat(editUsd.replace(',', '.')) || 0
                return (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-2.5">
                      {editando ? (
                        <span className="flex items-center gap-2">
                          <input
                            type="text" value={editTipo} autoFocus
                            onChange={e => setEditTipo(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={editCat}
                            onChange={e => setEditCat(e.target.value as CategoriaPrecioDolar)}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="zapatos">{CATEGORIA_PRECIO_DOLAR_LABELS.zapatos}</option>
                            <option value="prendas">{CATEGORIA_PRECIO_DOLAR_LABELS.prendas}</option>
                          </select>
                        </span>
                      ) : (
                        <span className="font-medium text-gray-900">
                          {p.tipo_articulo}
                          <span className="ml-2 inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[10px] font-medium">
                            {CATEGORIA_PRECIO_DOLAR_LABELS[p.categoria]}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {editando ? (
                        <input
                          type="text" inputMode="decimal" value={editUsd}
                          onChange={e => setEditUsd(e.target.value)}
                          className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-700">{formatUSD(p.valor_usd)}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-bold text-green-700">
                      {trm > 0
                        ? formatCOP(precioEnPesos(
                            editando ? (editUsdNum || p.valor_usd) : p.valor_usd,
                            trm,
                            editando ? editCat : p.categoria,
                          ))
                        : '—'}
                    </td>
                    {esAdmin && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {editando ? (
                          <span className="inline-flex items-center gap-2">
                            <button
                              onClick={() => guardarEdicion(p.id)}
                              disabled={guardando || !editTipo.trim() || !(editUsdNum > 0)}
                              className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button onClick={() => setEditandoId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2.5">
                            <button
                              onClick={() => { setEditandoId(p.id); setEditTipo(p.tipo_articulo); setEditUsd(String(p.valor_usd)); setEditCat(p.categoria) }}
                              title="Editar" className="text-gray-400 hover:text-blue-600"
                            >
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => eliminar(p)} title="Eliminar" className="text-gray-400 hover:text-red-600">
                              <Trash2 size={14} />
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {trm <= 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Falta configurar el valor del dólar para calcular los precios en pesos.
        </p>
      )}
    </div>
  )
}
