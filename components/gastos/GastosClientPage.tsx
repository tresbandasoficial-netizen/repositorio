'use client'

import { useState, useTransition } from 'react'
import { formatCOP, formatHora, formatMiles, hoyBogota } from '@/lib/utils/format'
import {
  Gasto, Cuenta, CategoriaGasto, CATEGORIA_GASTO_LABELS, CATEGORIAS_GASTO,
} from '@/types'
import { crearGastoAction, eliminarGastoAction } from '@/app/actions/gastos'
import { ConsignarDineroButton } from './ConsignarDineroButton'

function hoy() { return hoyBogota() }
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
  cuentasDestino?: { id: string; nombre: string }[]
  origenTrasladoId?: string
}

export function GastosClientPage({ gastos, cuentas, sedes, sedeRestringida, esAdmin = true, porCategoria, totalGeneral, filtros, cuentasDestino = [], origenTrasladoId = '' }: Props) {
  const [mostrarForm, setMostrarForm] = useState(false)
  // Sede por defecto: la restringida del asesor, o Bucaramanga para el admin
  const sedeDefecto = sedeRestringida?.id ?? sedes.find(s => s.codigo === 'TR')?.id ?? sedes[0]?.id ?? ''
  const [form, setForm] = useState({
    fecha:       hoy(),
    valor:       '',
    categoria:   '' as CategoriaGasto | '',
    sede_id:     sedeDefecto,
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
    if (!form.cuenta_id)      { setError('Selecciona la cuenta con la que se pagó el gasto'); return }

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
      setForm({ fecha: hoy(), valor: '', categoria: '', sede_id: sedeDefecto, cuenta_id: '', observacion: '' })
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {cuentasDestino.length > 0 && (
            <ConsignarDineroButton
              cuentasOrigen={cuentas}
              cuentasDestino={cuentasDestino}
              origenDefaultId={origenTrasladoId}
            />
          )}
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            + Nuevo gasto
          </button>
        </div>
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
                <input type="text" inputMode="numeric" value={formatMiles(form.valor)}
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
              <label className="block text-xs text-gray-500 mb-1">Cuenta con la que se pagó *</label>
              <select value={form.cuenta_id} onChange={e => set('cuenta_id', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Elige la cuenta…</option>
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

      {/* Lista de gastos agrupada por día, cada gasto en su celda */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">
            {gastos.length} gasto{gastos.length !== 1 ? 's' : ''}
          </p>
          <p className="text-sm font-bold text-red-600">{formatCOP(totalGeneral)}</p>
        </div>
        {gastos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay gastos en este período</div>
        ) : (
          <div className="p-3 space-y-4">
            {agruparPorDia(gastos).map(grupo => (
              <div key={grupo.fecha}>
                {/* Encabezado del día con su subtotal */}
                <div className="flex items-center justify-between px-2 py-1.5 mb-1.5 rounded-lg bg-gray-100">
                  <p className="text-xs font-bold text-gray-700">
                    📅 {etiquetaDia(grupo.fecha)}
                    <span className="font-normal text-gray-400"> ({grupo.items.length})</span>
                  </p>
                  <p className="text-xs font-bold text-red-600">{formatCOP(grupo.total)}</p>
                </div>
                <div className="space-y-1.5">
                  {grupo.items.map((g, i) => (
                    <div key={g.id} className="border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2.5 flex-wrap hover:border-red-200 transition-colors">
                      <span className="w-5 h-5 rounded-md bg-gray-200 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-xs text-gray-400 w-14 shrink-0">{formatHora(g.creado_en)}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${COLOR_CATEGORIA[g.categoria] ?? 'bg-gray-100 text-gray-600'}`}>
                        {CATEGORIA_GASTO_LABELS[g.categoria]}
                      </span>
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{(g.sede as any)?.codigo ?? '—'}</span>
                      <span className="text-xs text-gray-500 shrink-0">{(g.cuenta as any)?.nombre ?? 'sin cuenta'}</span>
                      <span className="text-xs text-gray-400 truncate flex-1 min-w-24">{g.observacion ?? ''}</span>
                      <span className="text-sm font-bold text-red-600 shrink-0 ml-auto">{formatCOP(g.valor)}</span>
                      {esAdmin && (
                        <button
                          onClick={() => handleEliminar(g.id)}
                          className="text-xs text-gray-300 hover:text-red-600 transition-colors shrink-0"
                          title="Eliminar gasto"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Color de la etiqueta según la categoría del gasto
const COLOR_CATEGORIA: Record<string, string> = {
  compras_mercancia: 'bg-purple-100 text-purple-700',
  domicilios:        'bg-amber-100 text-amber-700',
  publicidad:        'bg-pink-100 text-pink-700',
  nomina:            'bg-blue-100 text-blue-700',
  arriendo:          'bg-indigo-100 text-indigo-700',
  servicios:         'bg-cyan-100 text-cyan-700',
  transporte:        'bg-orange-100 text-orange-700',
  papeleria:         'bg-teal-100 text-teal-700',
  otros:             'bg-gray-100 text-gray-600',
}

// Nombre del día para el encabezado: "Hoy", "Ayer" o el día de la semana en
// la última semana; después de una semana ya sale la fecha completa.
function etiquetaDia(fecha: string): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const diffDias = Math.round((Date.parse(hoy + 'T12:00:00') - Date.parse(fecha + 'T12:00:00')) / 86400000)
  const d = new Date(fecha + 'T12:00:00')
  if (diffDias === 0) return 'Hoy'
  if (diffDias === 1) return 'Ayer'
  if (diffDias > 1 && diffDias < 7) {
    const dia = d.toLocaleDateString('es-CO', { weekday: 'long' })
    return dia.charAt(0).toUpperCase() + dia.slice(1)
  }
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Agrupa los gastos (que ya vienen ordenados por fecha desc) por día
function agruparPorDia<T extends { fecha: string; valor: number }>(gastos: T[]): Array<{ fecha: string; items: T[]; total: number }> {
  const grupos: Array<{ fecha: string; items: T[]; total: number }> = []
  for (const g of gastos) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === g.fecha) {
      ultimo.items.push(g)
      ultimo.total += g.valor
    } else {
      grupos.push({ fecha: g.fecha, items: [g], total: g.valor })
    }
  }
  return grupos
}
