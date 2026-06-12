'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NuevoDomicilioPanel } from './NuevoDomicilioPanel'
import { DomicilioCard } from './DomicilioCard'
import type { DomicilioRow, CuadreDia, CuadreSemana } from '@/lib/queries/domicilios'

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }
const WA_NUMEROS = { exneider: '573166579773', servigo: '573232501670' }

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function labelDia(fecha: string) {
  const d = new Date(fecha + 'T00:00:00Z')
  return `${DIAS_SEMANA[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

interface Props {
  fecha: string
  domicilios: DomicilioRow[]
  cuadre: CuadreDia
  cuadreSemana: CuadreSemana
  isAdmin: boolean
  fechasDisponibles: string[]
}

export function DomiciliosCliente({ fecha, domicilios, cuadre, cuadreSemana, isAdmin, fechasDisponibles }: Props) {
  const router = useRouter()
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [filtroMensajeria, setFiltroMensajeria] = useState<'todos' | 'exneider' | 'servigo'>('todos')
  const [vistaCuadre, setVistaCuadre] = useState<'dia' | 'semana'>('dia')

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
      const recoge = d.metodo_pago === 'efectivo' ? d.valor_pedido : 0
      const cobro = recoge > 0 ? `recoge ${formatCOP(recoge)}` : 'transferencia'
      const domi = d.cobrar_al_cliente
        ? `domi ${formatCOP(d.valor_domicilio)} cliente`
        : `domi ${formatCOP(d.valor_domicilio)} nosotros`
      return `${i + 1}. ${d.cliente_nombre} | ${d.direccion} | ${cobro} | ${domi}`
    }).join('\n')
    const m = cuadre.por_mensajeria.find(x => x.mensajeria === mensajeria)!
    const resumen = [
      `Efectivo recogido (nos deben): ${formatCOP(m.nos_deben)}`,
      `Domicilios que pagamos nosotros: ${formatCOP(m.les_debemos)}`,
      `*Neto a entregarnos: ${formatCOP(m.neto)}*`,
    ].join('\n')
    const msg = `*CUADRE DOMICILIOS ${fecha}*\n${lineas}\n\n${resumen}`
    window.open(`https://wa.me/${WA_NUMEROS[mensajeria]}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function abrirWhatsAppCuadreSemanal(mensajeria: 'exneider' | 'servigo') {
    const dias = cuadreSemana.por_dia.filter(d =>
      mensajeria === 'exneider' ? d.exneider_total > 0 : d.servigo_total > 0
    )
    if (dias.length === 0) return
    const lineas = dias.map(d => {
      const total = mensajeria === 'exneider' ? d.exneider_total : d.servigo_total
      const neto = mensajeria === 'exneider' ? d.exneider_neto : d.servigo_neto
      return `${labelDia(d.fecha)}: ${total} domicilio${total !== 1 ? 's' : ''} · neto ${formatCOP(neto)}`
    }).join('\n')
    const m = cuadreSemana.por_mensajeria.find(x => x.mensajeria === mensajeria)!
    const resumen = [
      `Efectivo recogido (nos deben): ${formatCOP(m.nos_deben)}`,
      `Domicilios que pagamos nosotros: ${formatCOP(m.les_debemos)}`,
      `*Neto a entregarnos: ${formatCOP(m.neto)}*`,
    ].join('\n')
    const msg = `*CUADRE SEMANAL ${MENSAJERIA_LABELS[mensajeria].toUpperCase()}*\nSemana del ${cuadreSemana.desde} al ${cuadreSemana.hasta}\n\n${lineas}\n\n${resumen}`
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

      {/* Cuadre */}
      {(domicilios.length > 0 || cuadreSemana.total_domicilios > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Cuadre</h2>
              <div className="flex gap-1">
                {(['dia', 'semana'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVistaCuadre(v)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      vistaCuadre === v
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {v === 'dia' ? 'Día' : 'Semana'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">
                Neto {formatCOP(vistaCuadre === 'dia' ? cuadre.total_neto : cuadreSemana.total_neto)}
              </span>
              {vistaCuadre === 'dia' && (
                <Link
                  href={`/domicilios/cuadre?fecha=${fecha}`}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Ver detalle
                </Link>
              )}
            </div>
          </div>

          {/* Vista día */}
          {vistaCuadre === 'dia' && (
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
                      <span className={`font-semibold ${m.neto >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {m.neto >= 0 ? 'Nos debe' : 'Le debemos'} {formatCOP(Math.abs(m.neto))}
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirWhatsAppCuadre(m.mensajeria)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                      >
                        WA
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                    <span>Efectivo recogido: {formatCOP(m.nos_deben)}</span>
                    <span>Domis que pagamos: {formatCOP(m.les_debemos)}</span>
                  </div>
                </div>
              ))}

              {cuadre.total_domicilios === 0 && (
                <p className="px-5 py-4 text-sm text-gray-400">Sin domicilios este día</p>
              )}

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
          )}

          {/* Vista semana */}
          {vistaCuadre === 'semana' && (
            <div>
              <p className="px-5 pt-3 text-xs text-gray-400">
                Semana del {cuadreSemana.desde} al {cuadreSemana.hasta}
              </p>

              {/* Tabla por día */}
              <div className="px-5 py-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left font-medium pb-2">Día</th>
                      <th className="text-right font-medium pb-2">Exneider</th>
                      <th className="text-right font-medium pb-2">Servigo</th>
                      <th className="text-right font-medium pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cuadreSemana.por_dia.map(d => (
                      <tr key={d.fecha}>
                        <td className="py-1.5 text-gray-700">{labelDia(d.fecha)}</td>
                        <td className="py-1.5 text-right text-gray-600">
                          {d.exneider_total > 0 ? `${d.exneider_total} · ${formatCOP(d.exneider_neto)}` : '—'}
                        </td>
                        <td className="py-1.5 text-right text-gray-600">
                          {d.servigo_total > 0 ? `${d.servigo_total} · ${formatCOP(d.servigo_neto)}` : '—'}
                        </td>
                        <td className="py-1.5 text-right font-medium text-gray-900">
                          {formatCOP(d.exneider_neto + d.servigo_neto)}
                        </td>
                      </tr>
                    ))}
                    {cuadreSemana.por_dia.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-gray-400">
                          Sin domicilios esta semana
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totales por mensajería con WA semanal */}
              <div className="divide-y divide-gray-50 border-t border-gray-100">
                {cuadreSemana.por_mensajeria.filter(m => m.total_domicilios > 0).map(m => (
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
                          {m.total_domicilios} domicilio{m.total_domicilios !== 1 ? 's' : ''} en la semana
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold ${m.neto >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {m.neto >= 0 ? 'Nos debe' : 'Le debemos'} {formatCOP(Math.abs(m.neto))}
                        </span>
                        <button
                          type="button"
                          onClick={() => abrirWhatsAppCuadreSemanal(m.mensajeria)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
                        >
                          WA semanal
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                      <span>Efectivo recogido: {formatCOP(m.nos_deben)}</span>
                      <span>Domis que pagamos: {formatCOP(m.les_debemos)}</span>
                    </div>
                  </div>
                ))}

                {/* Por asesor (semana) */}
                {cuadreSemana.por_asesor.length > 1 && (
                  <div className="px-5 py-3 bg-gray-50">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Por asesor (semana)</p>
                    <div className="flex flex-wrap gap-4">
                      {cuadreSemana.por_asesor.map(a => (
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
