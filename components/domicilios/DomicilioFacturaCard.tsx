'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarDespachoDomicilioAction } from '@/app/actions/domicilios'
import { buildMensajeMensajeria, buildLineaExcel } from './parsearDomicilio'
import { formatCOP } from '@/lib/utils/format'
import type { DomicilioFactura } from '@/lib/queries/facturas'

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const WA_NUMEROS: Record<string, string> = {
  exneider: '573166579773',
  servigo:  '573232501670',
}

interface Props {
  domicilio: DomicilioFactura
  numeroFactura: string
  asesorNombre?: string
}

export function DomicilioFacturaCard({ domicilio, numeroFactura, asesorNombre = '' }: Props) {
  const router = useRouter()
  const [direccion, setDireccion] = useState(domicilio.direccion ?? '')
  const [articulo, setArticulo] = useState(domicilio.articulo ?? '')
  const [notas, setNotas] = useState(domicilio.notas ?? '')
  const [copiado, setCopiado] = useState<'msg' | 'excel' | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const mensajeria = domicilio.mensajeria
  const mensajeriaLabel = mensajeria.charAt(0).toUpperCase() + mensajeria.slice(1)

  // Cambios pendientes de guardar respecto a lo que hay en BD.
  const cambios =
    direccion.trim() !== (domicilio.direccion ?? '').trim() ||
    articulo.trim() !== (domicilio.articulo ?? '').trim() ||
    notas.trim() !== (domicilio.notas ?? '').trim()

  const dataDomi = {
    fecha:             domicilio.fecha,
    mensajeria,
    cliente_nombre:    domicilio.cliente_nombre,
    cliente_telefono:  domicilio.cliente_telefono,
    direccion:         direccion.trim(),
    valor_pedido:      domicilio.valor_pedido,
    valor_domicilio:   domicilio.valor_domicilio,
    cobrar_al_cliente: domicilio.cobrar_al_cliente,
    metodo_pago:       domicilio.metodo_pago,
    articulo:          articulo.trim() || null,
    numero_pedido:     domicilio.numero_pedido ?? numeroFactura,
    notas:             notas.trim() || null,
    asesor_nombre:     asesorNombre,
  }

  function guardar(): Promise<boolean> {
    return new Promise(resolve => {
      start(async () => {
        const r = await actualizarDespachoDomicilioAction(domicilio.id, {
          direccion, articulo, notas,
        })
        if (!r.ok) { setError(r.error); resolve(false); return }
        setError(null)
        setGuardado(true)
        setTimeout(() => setGuardado(false), 2000)
        router.refresh()
        resolve(true)
      })
    })
  }

  async function copiar(tipo: 'msg' | 'excel') {
    if (cambios) { const ok = await guardar(); if (!ok) return }
    const texto = tipo === 'msg'
      ? buildMensajeMensajeria(dataDomi)
      : buildLineaExcel(dataDomi)
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(tipo)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  async function abrirWhatsApp() {
    if (!direccion.trim()) { setError('Agrega la dirección antes de enviar a la mensajería'); return }
    if (cambios) { const ok = await guardar(); if (!ok) return }
    const msg = encodeURIComponent(buildMensajeMensajeria(dataDomi))
    const num = WA_NUMEROS[mensajeria] ?? ''
    if (num) window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  // Qué cobra el mensajero al cliente (recaudo + domicilio si lo paga el cliente).
  const cobra = domicilio.valor_a_cobrar
  const recaudo = domicilio.metodo_pago === 'efectivo' ? domicilio.valor_pedido : 0
  const domiCliente = domicilio.cobrar_al_cliente ? domicilio.valor_domicilio : 0

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">🛵 Domicilio · {mensajeriaLabel}</p>
        <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${
          domicilio.estado === 'entregado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {domicilio.estado === 'entregado' ? 'Entregado' : 'Pendiente'}
        </span>
      </div>

      {/* Instrucción al mensajero */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
        <p className="text-[11px] font-semibold text-indigo-400 uppercase mb-1">💬 Instrucción al mensajero</p>
        {cobra > 0 ? (
          <>
            <p className="text-sm font-bold text-indigo-800">Cobrar al cliente: {formatCOP(cobra)}</p>
            {recaudo > 0 && domiCliente > 0 ? (
              <p className="text-xs text-indigo-500 mt-0.5">{formatCOP(recaudo)} recaudo + {formatCOP(domiCliente)} domicilio</p>
            ) : domiCliente > 0 ? (
              <p className="text-xs text-indigo-500 mt-0.5">Solo el domicilio</p>
            ) : (
              <p className="text-xs text-indigo-500 mt-0.5">Recaudo del pedido</p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold text-green-700">No cobrar · solo entregar</p>
        )}
        {!domicilio.cobrar_al_cliente && domicilio.valor_domicilio > 0 && (
          <p className="text-[11px] text-amber-600 mt-1">El domicilio ({formatCOP(domicilio.valor_domicilio)}) lo paga TB · queda como deuda con {mensajeriaLabel}.</p>
        )}
      </div>

      {/* Datos del cliente — solo lectura */}
      <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Cliente</p>
          <p className="text-sm font-medium text-gray-900">{domicilio.cliente_nombre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Teléfono</p>
          <p className="text-sm text-gray-700">{domicilio.cliente_telefono || '—'}</p>
        </div>
      </div>

      {/* Dirección (editable — puede faltar al facturar) */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Dirección de entrega {!domicilio.direccion && <span className="text-red-500 font-medium">· falta completar</span>}
        </label>
        <input
          className={`${inputCls} ${!direccion.trim() ? 'border-red-300 focus:ring-red-400' : ''}`}
          value={direccion}
          onChange={e => setDireccion(e.target.value)}
          placeholder="Calle 10 #5-23, Barrio…"
        />
      </div>

      {/* Artículo */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Artículo / descripción</label>
        <input className={inputCls} value={articulo}
          onChange={e => setArticulo(e.target.value)}
          placeholder="Tenis, ropa…" />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
        <input className={inputCls} value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Indicaciones para el mensajero…" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={abrirWhatsApp}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-60"
        >
          📲 Enviar a {mensajeriaLabel}
        </button>
        <button
          type="button"
          onClick={() => copiar('msg')}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors disabled:opacity-60"
        >
          {copiado === 'msg' ? '✓ Copiado' : '📋 Copiar mensaje'}
        </button>
        <button
          type="button"
          onClick={() => copiar('excel')}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-colors disabled:opacity-60"
        >
          {copiado === 'excel' ? '✓ Copiado' : 'Línea Excel'}
        </button>
        {cambios && (
          <button
            type="button"
            onClick={() => guardar()}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
        {guardado && !cambios && <span className="text-xs text-green-600 font-medium">✓ Guardado</span>}
        <a
          href="/domicilios"
          className="inline-block px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors ml-auto"
        >
          Ver domicilios
        </a>
      </div>
    </div>
  )
}
