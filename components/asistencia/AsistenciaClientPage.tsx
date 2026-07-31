'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarAsistenciaAction, eliminarMarcaAsistenciaAction } from '@/app/actions/asistencia'
import { formatHora } from '@/lib/utils/format'
import { Loader2, LogIn, LogOut, Trash2, Clock } from 'lucide-react'

export type MarcaAsistencia = {
  id: string
  usuario_id: string
  llegada: string
  salida: string | null
  usuario_nombre: string
  sede_codigo: string | null
}

function fechaBogota(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso))
}

function labelDia(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

function duracion(llegada: string, salida: string): string {
  const min = Math.max(0, Math.round((new Date(salida).getTime() - new Date(llegada).getTime()) / 60000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function AsistenciaClientPage({ marcas, esAdmin, turnoAbierto }: {
  marcas: MarcaAsistencia[]
  esAdmin: boolean
  turnoAbierto: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filtroUsuario, setFiltroUsuario] = useState('')

  const usuarios = useMemo(() => {
    const map = new Map<string, string>()
    marcas.forEach(m => map.set(m.usuario_id, m.usuario_nombre))
    return Array.from(map, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [marcas])

  const visibles = filtroUsuario ? marcas.filter(m => m.usuario_id === filtroUsuario) : marcas

  // Agrupadas por día Bogotá, cada día con sus turnos en orden de llegada.
  const dias = useMemo(() => {
    const porDia = new Map<string, MarcaAsistencia[]>()
    visibles.forEach(m => {
      const dia = fechaBogota(m.llegada)
      if (!porDia.has(dia)) porDia.set(dia, [])
      porDia.get(dia)!.push(m)
    })
    return Array.from(porDia, ([dia, rows]) => ({
      dia,
      rows: rows.slice().sort((a, b) => a.llegada.localeCompare(b.llegada)),
    }))
  }, [visibles])

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
      }
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Asistencia</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {esAdmin ? 'Horas de llegada y salida del equipo' : 'Marca tu llegada al entrar y tu salida al irte'}
        </p>
      </div>

      {/* Botón grande de marcar (el admin solo consulta) */}
      {!esAdmin && (
        <button
          onClick={() => ejecutar(marcarAsistenciaAction)}
          disabled={isPending}
          className={`w-full flex items-center justify-center gap-3 rounded-2xl py-6 text-lg font-bold text-white shadow-md transition-colors disabled:opacity-60 ${
            turnoAbierto
              ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'
              : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
          }`}
        >
          {isPending
            ? <Loader2 size={22} className="animate-spin" />
            : turnoAbierto ? <LogOut size={22} /> : <LogIn size={22} />}
          {turnoAbierto ? 'Marcar SALIDA' : 'Marcar LLEGADA'}
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {esAdmin && usuarios.length > 1 && (
        <select
          value={filtroUsuario}
          onChange={e => setFiltroUsuario(e.target.value)}
          className="w-full sm:w-64 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los usuarios</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      )}

      {dias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center text-sm text-gray-400">
          Aún no hay marcas de asistencia en los últimos 30 días
        </div>
      ) : (
        dias.map(({ dia, rows }) => {
          const cerradas = rows.filter(r => r.salida)
          const unSoloUsuario = new Set(rows.map(r => r.usuario_id)).size === 1
          const totalMin = cerradas.reduce(
            (acc, r) => acc + (new Date(r.salida!).getTime() - new Date(r.llegada).getTime()) / 60000, 0)
          return (
            <div key={dia} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <Clock size={14} className="text-blue-600" />
                <p className="text-sm font-bold text-gray-900 capitalize">{labelDia(rows[0].llegada)}</p>
                {unSoloUsuario && totalMin > 0 && (
                  <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                    Total: {Math.floor(totalMin / 60)}h {Math.round(totalMin % 60)}m
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {rows.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="flex-1 min-w-0">
                      {esAdmin && (
                        <p className="font-semibold text-gray-800 truncate">
                          {m.usuario_nombre}{m.sede_codigo ? ` (${m.sede_codigo})` : ''}
                        </p>
                      )}
                      <p className="text-gray-600">
                        <span className="text-emerald-700 font-medium">Llegada {formatHora(m.llegada)}</span>
                        {' — '}
                        {m.salida
                          ? <span className="text-orange-700 font-medium">Salida {formatHora(m.salida)}</span>
                          : <span className="text-blue-600 font-medium animate-pulse">en turno…</span>}
                      </p>
                    </div>
                    {m.salida && (
                      <span className="shrink-0 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                        {duracion(m.llegada, m.salida)}
                      </span>
                    )}
                    {esAdmin && (
                      <button
                        onClick={() => { if (confirm('¿Eliminar esta marca?')) ejecutar(() => eliminarMarcaAsistenciaAction(m.id)) }}
                        className="text-gray-300 hover:text-red-500 shrink-0" title="Eliminar marca errada"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
