'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoDomicilioAction, eliminarDomicilioAction } from '@/app/actions/domicilios'
import { buildMensajeMensajeria, buildLineaExcel } from './parsearDomicilio'
import { EditarDomicilioPanel } from './EditarDomicilioPanel'
import type { DomicilioRow } from '@/lib/queries/domicilios'

const WA_NUMEROS = {
  exneider: '573166579773',
  servigo:  '573232501670',
}

const MENSAJERIA_LABELS: Record<string, string> = { exneider: 'Exneider', servigo: 'Servigo' }

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatHora(iso: string) {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}

interface Props {
  domicilio: DomicilioRow
  isAdmin: boolean
}

export function DomicilioCard({ domicilio: d, isAdmin }: Props) {
  const router = useRouter()
  const [copiado, setCopiado] = useState<'msg' | 'excel' | null>(null)
  const [editando, setEditando] = useState(false)
  const [isPending, start] = useTransition()

  function copiar(tipo: 'msg' | 'excel') {
    const texto = tipo === 'msg'
      ? buildMensajeMensajeria({ ...d, asesor_nombre: d.asesor_nombre })
      : buildLineaExcel({ ...d, asesor_nombre: d.asesor_nombre })
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(tipo)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  function abrirWhatsApp() {
    const msg = encodeURIComponent(buildMensajeMensajeria({ ...d, asesor_nombre: d.asesor_nombre }))
    window.open(`https://wa.me/${WA_NUMEROS[d.mensajeria]}?text=${msg}`, '_blank')
  }

  function toggleEstado() {
    const nuevo = d.estado === 'pendiente' ? 'entregado' : 'pendiente'
    start(async () => {
      await actualizarEstadoDomicilioAction(d.id, nuevo)
      router.refresh()
    })
  }

  function eliminar() {
    if (!confirm('¿Eliminar este domicilio?')) return
    start(async () => {
      await eliminarDomicilioAction(d.id)
      router.refresh()
    })
  }

  const entregado = d.estado === 'entregado'
  const initials = getInitials(d.cliente_nombre)
  const hora = d.creado_en ? formatHora(d.creado_en) : ''
  const subtitle = [d.numero_pedido ? `#${d.numero_pedido}` : null, hora].filter(Boolean).join(' · ')

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex shadow-sm">
      {/* Left color band */}
      <div className={`w-1.5 flex-none ${entregado ? 'bg-green-600' : 'bg-amber-400'}`} />

      {/* Content */}
      <div className="flex-1 p-4 min-w-0">
        {/* Top: avatar + name + badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-none font-extrabold text-sm ${
              entregado ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
            }`}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-gray-900 text-base leading-tight truncate">{d.cliente_nombre}</p>
              {subtitle && <p className="text-xs font-semibold text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-1 rounded-full flex-none ${
            entregado ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${entregado ? 'bg-green-600' : 'bg-amber-400'}`} />
            {entregado ? 'Entregado' : 'Pendiente'}
          </div>
        </div>

        {/* Info chips: WhatsApp + Mensajero */}
        <div className="flex gap-2 mt-3">
          <div className="flex-1 bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">WhatsApp</p>
            {d.cliente_telefono
              ? <p className="text-xs font-bold text-gray-700 mt-0.5">{d.cliente_telefono}</p>
              : <p className="text-xs font-bold text-gray-300 mt-0.5">Por confirmar</p>}
          </div>
          <div className="flex-1 bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mensajero</p>
            <p className="text-xs font-bold text-gray-700 mt-0.5">{MENSAJERIA_LABELS[d.mensajeria] ?? d.mensajeria}</p>
          </div>
        </div>

        {/* Bottom: article + value */}
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-gray-100 gap-2">
          <p className="text-sm font-bold text-gray-600 leading-snug">
            {d.articulo || d.direccion}
          </p>
          <div className="text-right flex-none">
            {d.valor_pedido > 0
              ? <>
                  <p className={`text-lg font-extrabold leading-tight ${
                    d.metodo_pago === 'transferencia' ? 'text-cyan-600' : 'text-gray-900'
                  }`}>{formatCOP(d.valor_pedido)}</p>
                  <p className="text-[11px] font-bold text-gray-400 mt-0.5">
                    {d.metodo_pago === 'transferencia' ? 'Transferencia' : 'Cobra efectivo'}
                  </p>
                </>
              : <>
                  <p className="text-lg font-extrabold leading-tight text-gray-300">Por confirmar</p>
                  <p className="text-[11px] font-bold text-gray-400 mt-0.5">Valor del pedido</p>
                </>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            type="button"
            onClick={toggleEstado}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              entregado
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {entregado ? '✓ Entregado' : 'Marcar entregado'}
          </button>
          <button
            type="button"
            onClick={abrirWhatsApp}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
          >
            WA {MENSAJERIA_LABELS[d.mensajeria]}
          </button>
          <button
            type="button"
            onClick={() => copiar('msg')}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {copiado === 'msg' ? '✓ Copiado' : 'Pedir domicilio'}
          </button>
          <button
            type="button"
            onClick={() => copiar('excel')}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {copiado === 'excel' ? '✓ Copiado' : 'Línea Excel'}
          </button>
          <button
            type="button"
            onClick={() => setEditando(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {editando ? 'Cancelar' : 'Editar'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={eliminar}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors ml-auto"
            >
              Eliminar
            </button>
          )}
        </div>

        {editando && (
          <EditarDomicilioPanel
            domicilio={d}
            onGuardado={() => { setEditando(false); router.refresh() }}
            onCancelar={() => setEditando(false)}
          />
        )}
      </div>
    </div>
  )
}
