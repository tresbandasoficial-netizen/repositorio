'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoDomicilioAction, eliminarDomicilioAction } from '@/app/actions/domicilios'
import { buildMensajeMensajeria, buildLineaExcel } from './parsearDomicilio'
import type { DomicilioRow } from '@/lib/queries/domicilios'

const WA_NUMEROS = {
  exneider: '573166579773',
  servigo:  '573232501670',
}

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

interface Props {
  domicilio: DomicilioRow
  isAdmin: boolean
}

export function DomicilioCard({ domicilio: d, isAdmin }: Props) {
  const router = useRouter()
  const [copiado, setCopiado] = useState<'msg' | 'excel' | null>(null)
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

  return (
    <div className={`bg-white rounded-xl border transition-colors ${entregado ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{d.cliente_nombre}</span>
              {d.numero_pedido && (
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {d.numero_pedido}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                d.mensajeria === 'exneider'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}>
                {MENSAJERIA_LABELS[d.mensajeria]}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                d.metodo_pago === 'transferencia'
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {d.metodo_pago === 'transferencia' ? '🏦 Transferencia' : '💵 Efectivo'}
              </span>
            </div>
            {d.cliente_telefono && (
              <p className="text-sm text-gray-500 mt-0.5">{d.cliente_telefono}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">{d.direccion}</p>
            {d.articulo && (
              <p className="text-sm text-gray-500 mt-0.5">📦 {d.articulo}</p>
            )}
            {d.notas && (
              <p className="text-xs text-gray-400 mt-0.5 italic">{d.notas}</p>
            )}
          </div>

          <div className="text-right shrink-0">
            {(() => {
              const cobra = (d.metodo_pago === 'efectivo' ? d.valor_pedido : 0)
                + (d.cobrar_al_cliente ? d.valor_domicilio : 0)
              return (
                <p className="font-semibold text-gray-900">
                  {cobra > 0 ? `Cobra ${formatCOP(cobra)}` : 'No cobra'}
                </p>
              )
            })()}
            <p className="text-xs text-gray-400 mt-0.5">
              Domi {formatCOP(d.valor_domicilio)} · {d.cobrar_al_cliente ? 'cliente' : 'nosotros'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{d.asesor_nombre}</p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* Estado */}
          <button
            type="button"
            onClick={toggleEstado}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              entregado
                ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            {entregado ? '✓ Entregado' : 'Marcar entregado'}
          </button>

          {/* WhatsApp */}
          <button
            type="button"
            onClick={abrirWhatsApp}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
          >
            WhatsApp {MENSAJERIA_LABELS[d.mensajeria]}
          </button>

          {/* Copiar mensaje */}
          <button
            type="button"
            onClick={() => copiar('msg')}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {copiado === 'msg' ? '✓ Copiado' : 'Copiar mensaje'}
          </button>

          {/* Copiar Excel */}
          <button
            type="button"
            onClick={() => copiar('excel')}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          >
            {copiado === 'excel' ? '✓ Copiado' : 'Línea Excel'}
          </button>

          {/* Eliminar */}
          {(isAdmin) && (
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
      </div>
    </div>
  )
}
