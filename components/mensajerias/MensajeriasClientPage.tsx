'use client'

import { useState, useTransition } from 'react'
import { formatCOP } from '@/lib/utils/format'
import { TipoMensajeria, MENSAJERIA_LABELS, Cuenta, PagoMensajeria } from '@/types'
import { registrarPagoMensajeriaAction } from '@/app/actions/mensajerias'
import type { ResumenMensajeria, DomicilioPendienteMensajeria } from '@/app/actions/mensajerias'

function hoy() { return new Date().toISOString().slice(0, 10) }

const MENSAJERIAS: TipoMensajeria[] = ['exneider', 'servigo', 'otro']

interface Props {
  resumenes: ResumenMensajeria[]
  pendientes: DomicilioPendienteMensajeria[]
  historial: PagoMensajeria[]
  cuentas: Cuenta[]
  activaMensajeria: TipoMensajeria
}

export function MensajeriasClientPage({ resumenes, pendientes, historial, cuentas, activaMensajeria }: Props) {
  const [activa, setActiva] = useState<TipoMensajeria>(activaMensajeria)
  const [mostrarPago, setMostrarPago] = useState(false)
  const [form, setForm] = useState({ monto: '', fecha: hoy(), cuenta_id: '', notas: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const resumenActivo = resumenes.find(r => r.mensajeria === activa)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function cambiarMensajeria(m: TipoMensajeria) {
    setActiva(m)
    setMostrarPago(false)
    window.history.replaceState(null, '', `/mensajerias?mensajeria=${m}`)
    window.location.reload()
  }

  function handlePago() {
    setError(null)
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10)
    if (!monto || monto <= 0) { setError('Ingresa un monto válido'); return }

    start(async () => {
      const r = await registrarPagoMensajeriaAction({
        mensajeria: activa,
        monto,
        fecha:      form.fecha,
        cuenta_id:  form.cuenta_id || null,
        notas:      form.notas,
      })
      if (!r.ok) { setError(r.error); return }
      setMostrarPago(false)
      setForm({ monto: '', fecha: hoy(), cuenta_id: '', notas: '' })
      window.location.reload()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mensajerías</h1>
        <p className="text-sm text-gray-500 mt-0.5">Control de pagos pendientes con mensajerías</p>
      </div>

      {/* Tabs mensajerías */}
      <div className="flex gap-2">
        {MENSAJERIAS.map(m => {
          const r = resumenes.find(x => x.mensajeria === m)
          return (
            <button
              key={m}
              onClick={() => cambiarMensajeria(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activa === m
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {MENSAJERIA_LABELS[m]}
              {r && r.saldo_pendiente > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activa === m ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>
                  {formatCOP(r.saldo_pendiente)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Resumen del activo */}
      {resumenActivo && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total adeudado</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCOP(resumenActivo.total_deuda)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total pagado</p>
            <p className="text-xl font-bold text-green-700 mt-1">{formatCOP(resumenActivo.total_pagado)}</p>
          </div>
          <div className={`rounded-xl p-4 ${resumenActivo.saldo_pendiente > 0 ? 'bg-red-600' : 'bg-green-600'}`}>
            <p className={`text-xs ${resumenActivo.saldo_pendiente > 0 ? 'text-red-100' : 'text-green-100'}`}>Pendiente de pagar</p>
            <p className="text-xl font-bold text-white mt-1">{formatCOP(resumenActivo.saldo_pendiente)}</p>
          </div>
        </div>
      )}

      {/* Botón registrar pago */}
      <div className="flex justify-end">
        <button
          onClick={() => setMostrarPago(!mostrarPago)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          + Registrar pago a {MENSAJERIA_LABELS[activa]}
        </button>
      </div>

      {/* Formulario de pago */}
      {mostrarPago && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Pago a {MENSAJERIA_LABELS[activa]}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="text" inputMode="numeric" value={form.monto}
                  onChange={e => set('monto', e.target.value.replace(/\D/g, ''))}
                  placeholder={resumenActivo ? resumenActivo.saldo_pendiente.toString() : '0'}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cuenta de egreso</label>
              <select value={form.cuenta_id} onChange={e => set('cuenta_id', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin especificar</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notas</label>
              <input type="text" value={form.notas} onChange={e => set('notas', e.target.value)}
                placeholder="Período cubierto, referencia..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handlePago} disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {isPending ? 'Registrando...' : 'Registrar pago'}
            </button>
            <button onClick={() => setMostrarPago(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Deudas pendientes */}
      {pendientes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Domicilios pendientes de pagar</p>
          </div>
          <div className="divide-y divide-gray-50">
            {pendientes.map(d => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.cliente_nombre}</p>
                  <p className="text-xs text-gray-400">{d.fecha} · {d.direccion}</p>
                </div>
                <p className="font-semibold text-red-700 whitespace-nowrap">{formatCOP(d.monto_deuda)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de pagos realizados */}
      {historial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Historial de pagos realizados</p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {historial.filter(h => h.tipo === 'pago').map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-gray-500">{h.fecha}</td>
                  <td className="px-3 py-2.5 text-gray-500">{(h.cuenta as any)?.nombre ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{h.notas ?? '—'}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCOP(h.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
