'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearTareaAction, completarTareaAction, reabrirTareaAction, eliminarTareaAction } from '@/app/actions/tareas'
import type { TareaRow } from '@/lib/queries/tareas'
import { formatDemora } from '@/lib/utils/demora'
import { formatFechaHora } from '@/lib/utils/format'
import { Loader2, Plus, Check, Trash2, RotateCcw, ClipboardList, Timer } from 'lucide-react'

type Asesor = { id: string; nombre: string; sede_codigo: string | null }

export function TareasClientPage({ tareas, asesores, esAdmin }: {
  tareas: TareaRow[]
  asesores: Asesor[]
  esAdmin: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Formulario de nueva tarea (admin)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [asignadoA, setAsignadoA] = useState('')
  const [completandoId, setCompletandoId] = useState<string | null>(null)

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null)
      try {
        const r = await fn()
        if (!r.ok) { setError(r.error ?? 'No se pudo completar la acción'); return }
        router.refresh()
      } catch (e) {
        console.error(e)
        setError('Hubo una actualización del sistema. Recarga la página (F5) e intenta de nuevo.')
      } finally {
        setCompletandoId(null)
      }
    })
  }

  function crear() {
    if (!titulo.trim()) { setError('Escribe el título de la tarea'); return }
    if (!asignadoA) { setError('Elige a quién se la asignas'); return }
    ejecutar(async () => {
      const r = await crearTareaAction({ titulo, descripcion, asignado_a: asignadoA })
      if (r.ok) { setTitulo(''); setDescripcion(''); setMostrarForm(false) }
      return r
    })
  }

  const pendientes = tareas.filter(t => t.estado === 'pendiente')
  const completadas = tareas.filter(t => t.estado === 'completada')

  return (
    <div className="space-y-5">
      {/* Header + nueva tarea */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {esAdmin ? 'Asigna tareas y mide cuánto se demoran' : 'Tus tareas pendientes — márcalas al terminar'}
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={() => { setMostrarForm(!mostrarForm); setError(null) }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-2xl transition-colors shadow-md shadow-blue-200"
          >
            <Plus size={15} /> Nueva tarea
          </button>
        )}
      </div>

      {mostrarForm && esAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <p className="text-sm font-bold text-gray-900">Asignar tarea</p>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Título — ej: Contar el inventario de tenis"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Detalle (opcional)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={asignadoA}
              onChange={e => setAsignadoA(e.target.value)}
              className="flex-1 min-w-48 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">¿Para quién? …</option>
              {asesores.map(a => (
                <option key={a.id} value={a.id}>{a.nombre}{a.sede_codigo ? ` (${a.sede_codigo})` : ''}</option>
              ))}
            </select>
            <button
              onClick={crear}
              disabled={isPending}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : 'Asignar'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Pendientes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <ClipboardList size={15} className="text-blue-600" />
          <p className="text-sm font-bold text-gray-900">Pendientes</p>
          <span className="text-xs text-gray-400">({pendientes.length})</span>
        </div>
        {pendientes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            {esAdmin ? 'No hay tareas pendientes — asigna una con "Nueva tarea"' : '¡Al día! No tienes tareas pendientes 🎉'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {pendientes.map(t => (
              <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                <button
                  onClick={() => { setCompletandoId(t.id); ejecutar(() => completarTareaAction(t.id)) }}
                  disabled={isPending}
                  title="Marcar como terminada"
                  className="mt-0.5 w-6 h-6 rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors shrink-0 flex items-center justify-center"
                >
                  {isPending && completandoId === t.id
                    ? <Loader2 size={12} className="animate-spin text-emerald-600" />
                    : <Check size={13} className="text-transparent hover:text-emerald-600" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t.titulo}</p>
                  {t.descripcion && <p className="text-xs text-gray-500 mt-0.5">{t.descripcion}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {esAdmin && <span className="font-medium text-gray-500">{t.asesor_nombre}</span>}
                    {esAdmin && ' · '}asignada {formatFechaHora(t.creado_en)}
                  </p>
                </div>
                {esAdmin && (
                  <button
                    onClick={() => { if (confirm('¿Eliminar esta tarea?')) ejecutar(() => eliminarTareaAction(t.id)) }}
                    className="text-gray-300 hover:text-red-500 shrink-0 mt-1" title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completadas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Timer size={15} className="text-emerald-600" />
          <p className="text-sm font-bold text-gray-900">Completadas</p>
          <span className="text-xs text-gray-400">({completadas.length})</span>
        </div>
        {completadas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Aún no hay tareas completadas</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {completadas.map(t => (
              <div key={t.id} className="flex items-start gap-3 px-5 py-3.5 opacity-80">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-emerald-100 shrink-0 flex items-center justify-center">
                  <Check size={13} className="text-emerald-600" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 line-through decoration-gray-300">{t.titulo}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {esAdmin && <span className="font-medium text-gray-500">{t.asesor_nombre} · </span>}
                    terminada {t.completada_en ? formatFechaHora(t.completada_en) : ''}
                  </p>
                </div>
                {t.completada_en && (
                  <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 mt-0.5">
                    ⏱ {formatDemora(t.creado_en, t.completada_en)}
                  </span>
                )}
                {esAdmin && (
                  <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                    <button
                      onClick={() => ejecutar(() => reabrirTareaAction(t.id))}
                      className="text-gray-300 hover:text-blue-500" title="Reabrir (se marcó por error)"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => { if (confirm('¿Eliminar esta tarea?')) ejecutar(() => eliminarTareaAction(t.id)) }}
                      className="text-gray-300 hover:text-red-500" title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
