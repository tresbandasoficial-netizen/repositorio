'use client'

import { useState, useTransition } from 'react'
import { formatCOP } from '@/lib/utils/format'
import {
  Gasto, Cuenta, CategoriaGasto, CATEGORIA_GASTO_LABELS, CATEGORIAS_GASTO,
} from '@/types'
import { crearGastoAction, eliminarGastoAction } from '@/app/actions/gastos'

function hoy() { return new Date().toISOString().slice(0, 10) }
function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface Props {
  gastos: Gasto[]
  cuentas: { id: string; nombre: string }[]
  sedes: { id: string; codigo: string; nombre: string }[]
  sedeRestringida?: { id: string; codigo: string; nombre: string } | null
  esAdmin?: boolean
  porCategoria: { categoria: CategoriaGasto; label: string; total: number }[]
  totalGeneral: number
  filtros: { desde: string; hasta: string; categoria?: CategoriaGasto; sede_id?: string }
}

export function GastosClientPage({ gastos, cuentas, sedes, sedeRestringida, esAdmin = true, porCategoria, totalGeneral, filtros }: Props) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({
    fecha:       hoy(),
    valor:       '',
    categoria:   '' as CategoriaGasto | '',
    sede_id:     sedeRestringida?.id ?? sedes[0]?.id ?? '',
    cuenta_id:   '',
    observacion: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  // Los costos de compra de mercancía son información solo de admin.
  const categoriasVisibles = esAdmin
    ? CATEGORIAS_GASTO
    : CATEGORIAS_GASTO.filter(c => c !== 'compras_mercancia')

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleGuardar() {
    setError(null)
    const valor = parseInt(form.valor.replace(/\D/g, ''), 10)
    if (!valor || valor <= 0) { setError('Ingresa un valor válido'); return }
    if (!form.categoria)      { setError('Selecciona una categoría'); return }
    if (!form.sede_id)        { setError('Selecciona la sede'); return }

    start(async () => {
      const r = await crearGastoAction({
        fecha:       form.fecha,
        valor,
        categoria:   form.categoria as CategoriaGasto,
        sede_id:     form.sede_id,
        cuenta_id:   form.cuenta_id || null,
        observacion: form.observacion,
      })
      if (!r.ok) { setError(r.error); return }
      setMostrarForm(false)
      setForm({ fecha: hoy(), valor: '', categoria: '', sede_id: sedes[0]?.id ?? '', cuenta_id: '', observacion: '' })
      window.location.reload()
    })
  }

  function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    start(async () => {
      const r = await eliminarGastoAction(id)
      if (!r.ok) alert(r.error)
      else window.location.reload()
    })
  }

  // Filtros en URL
  function aplicarFiltro(k: string, v: string) {
    const p = new URLSearchParams(window.location.search)
    if (v) p.set(k, v); else p.delete(k)
    window.location.href = '/gastos?' + p.toString()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gastos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de egresos operacionales</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + Nuevo gasto
        </button>
      </div>

      {/* Formulario nuevo gasto */}
      {mostrarForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Registrar gasto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha *</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="text" inputMode="numeric" value={form.valor}
                  onChange={e => set('valor', e.target.value.replace(/\D/g, ''))}
                  placeholder="50000"
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Categoría *</label>
              <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar...</option>
                {categoriasVisibles.map(c => (
                  <option key={c} value={c}>{CATEGORIA_GASTO_LABELS[c]}</option>
                ))}
              </select>
            </div>
            {sedeRestringida ? (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sede</label>
                <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {sedeRestringida.nombre}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sede *</label>
                <select value={form.sede_id} onChange={e => set('sede_id', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cuenta de egreso</label>
              <select value={form.cuenta_id} onChange={e => set('cuenta_id', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin especificar</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Observación</label>
              <input type="text" value={form.observacion} onChange={e => set('observacion', e.target.value)}
                placeholder="Detalle del gasto..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>}

          <div className="flex gap-3">
            <button onClick={handleGuardar} disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? 'Guardando...' : 'Guardar gasto'}
            </button>
            <button onClick={() => setMostrarForm(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Desde</label>
          <input type="date" defaultValue={filtros.desde}
            onChange={e => aplicarFiltro('desde', e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Hasta</label>
          <input type="date" defaultValue={filtros.hasta}
            onChange={e => aplicarFiltro('hasta', e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select defaultValue={filtros.categoria ?? ''} onChange={e => aplicarFiltro('categoria', e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las categorías</option>
          {categoriasVisibles.map(c => <option key={c} value={c}>{CATEGORIA_GASTO_LABELS[c]}</option>)}
        </select>
        {!sedeRestringida && (
          <select defaultValue={filtros.sede_id ?? ''} onChange={e => aplicarFiltro('sede', e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las sedes</option>
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Resumen por categoría */}
      {porCategoria.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {porCategoria.map(c => (
            <div key={c.categoria} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-base font-bold text-gray-900 mt-1">{formatCOP(c.total)}</p>
            </div>
          ))}
          <div className="bg-red-600 rounded-xl p-4">
            <p className="text-xs text-red-100">Total egresos</p>
            <p className="text-lg font-bold text-white mt-1">{formatCOP(totalGeneral)}</p>
          </div>
        </div>
      )}

      {/* Tabla de gastos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">
            {gastos.length} gastos — {formatCOP(totalGeneral)}
          </p>
        </div>
        {gastos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay gastos en este período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Categoría</th>
                  <th className="text-left px-3 py-2">Sede</th>
                  <th className="text-left px-3 py-2">Cuenta</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-left px-3 py-2">Observación</th>
                  {esAdmin && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gastos.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{g.fecha}</td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">{CATEGORIA_GASTO_LABELS[g.categoria]}</td>
                    <td className="px-3 py-2.5 text-gray-500">{(g.sede as any)?.codigo ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{(g.cuenta as any)?.nombre ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-red-700">{formatCOP(g.valor)}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-xs truncate">{g.observacion ?? '—'}</td>
                    {esAdmin && (
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleEliminar(g.id)}
                          className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
