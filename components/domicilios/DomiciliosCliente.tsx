'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NuevoDomicilioPanel } from './NuevoDomicilioPanel'
import { DomicilioCard } from './DomicilioCard'
import type { DomicilioRow, CuadreDia } from '@/lib/queries/domicilios'

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }
const WA_NUMEROS = { exneider: '573166579773', servigo: '573232501670' }

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

interface Props {
  fecha: string
  domicilios: DomicilioRow[]
  cuadre: CuadreDia
  isAdmin: boolean
  fechasDisponibles: string[]
}

export function DomiciliosCliente({ fecha, domicilios, cuadre, isAdmin, fechasDisponibles }: Props) {
  const router = useRouter()
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [filtroMensajeria, setFiltroMensajeria] = useState<'todos' | 'exneider' | 'servigo'>('todos')

  function handleFechaChange(f: string) {
    router.push(`/domicilios?fecha=${f}`)
  }

  const domiciliosFiltrados = filtroMensajeria === 'todos'
    ? domicilios
    : domicilios.filter(d => d.mensajeria === filtroMensajeria)

  const pendientes = domicilios.filter(d => d.estado === 'pendiente').length
  const entregados = domicilios.filter(d => d.estado === 'entregado').length

  function abrirWhatsAppCuadre(mensajeria: 'exneider' | 'servigo') {
    const grupo = domicilios.filter(d => d.mensajeria === mensajeria)
    if (grupo.length === 0) return
    const lineas = grupo.map((d, i) => {
      const valor = d.cobrar_al_cliente ? formatCOP(d.valor_domicilio) : 'Sin cobro'
      return `${i + 1}. ${d.cliente_nombre} | ${d.direccion} | ${valor}`
    }).join('\n')
    const total = grupo.reduce((s, d) => s + (d.cobrar_al_cliente ? d.valor_domicilio : 0), 0)
    const msg = `*DOMICILIOS ${fecha}*\n${lineas}\n\n*Total a recoger: ${formatCOP(total)}*`
    window.open(`https://wa.me/${WA_NUMEROS[mensajeria]}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header con fecha */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select
            value={fecha}
            onChange={e => handleFechaChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value={new Date().toISOString().slice(0, 10)}>Hoy</option>
            {fechasDisponibles
              .filter(f => f !== new Date().toISOString().slice(0, 10))
              .map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
          </select>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium text-gray-900">{domicilios.length}</span> domicilios
            {pendientes > 0 && <span className="text-orange-500">· {pendientes} pendientes</span>}
            {entregados > 0 && <span className="text-green-600">· {entregados} entregados</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMostrarNuevo(v => !v)}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          {mostrarNuevo ? '✕ Cancelar' : '+ Nuevo domicilio'}
        </button>
      </div>

      {/* Formulario nuevo */}
      {mostrarNuevo && (
        <NuevoDomicilioPanel
          fecha={fecha}
          onCreado={() => { setMostrarNuevo(false); router.refresh() }}
        />
      )}

      {/* Cuadre del día */}
      {domicilios.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Cuadre del día</h2>
            <span className="text-sm font-semibold text-gray-900">{formatCOP(cuadre.total_valor)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {cuadre.por_mensajeria.filter(m => m.total_domicilios > 0).map(m => (
              <div key={m.mensajeria} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.mensajeria === 'exneider'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {MENSAJERIA_LABELS[m.mensajeria]}
                    </span>
                    <span className="text-sm text-gray-600">
                      {m.total_domicilios} domicilio{m.total_domicilios !== 1 ? 's' : ''}
                      {m.entregados > 0 && ` · ${m.entregados} entregado${m.entregados !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{formatCOP(m.total_valor)}</span>
                    <button
                      type="button"
                      onClick={() => abrirWhatsAppCuadre(m.mensajeria)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                    >
                      WA
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Por asesor */}
            {cuadre.por_asesor.length > 1 && (
              <div className="px-5 py-3 bg-gray-50">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Por asesor</p>
                <div className="flex flex-wrap gap-4">
                  {cuadre.por_asesor.map(a => (
                    <div key={a.asesor_nombre} className="text-sm">
                      <span className="font-medium text-gray-700">{a.asesor_nombre}</span>
                      <span className="text-gray-400 ml-1">{a.total} · {formatCOP(a.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtro mensajería */}
      {domicilios.length > 0 && (
        <div className="flex gap-2">
          {(['todos', 'exneider', 'servigo'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroMensajeria(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filtroMensajeria === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'todos' ? 'Todos' : MENSAJERIA_LABELS[f]}
              {f !== 'todos' && (
                <span className="ml-1 opacity-70">
                  ({domicilios.filter(d => d.mensajeria === f).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {domiciliosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {domicilios.length === 0
            ? 'No hay domicilios registrados para este día'
            : 'No hay domicilios de esta mensajería'}
        </div>
      ) : (
        <div className="space-y-3">
          {domiciliosFiltrados.map(d => (
            <DomicilioCard key={d.id} domicilio={d} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}
