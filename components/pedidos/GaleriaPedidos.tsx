'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PedidoRow } from '@/lib/queries/pedidos'
import { ESTADO_LABELS } from '@/types'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ImageOff, X, ArrowUpRight, Check, Phone } from 'lucide-react'

export type ItemGaleria = {
  codigo: string | null
  marca: string
  descripcion: string
  talla: string | null
  cantidad: number
  precio_venta: number
  sexo: string | null
  categoria: string | null
}

// Sexo del artículo como letra: M = mujer, H = hombre. Si el campo sexo no
// está, se detecta del texto de la talla/descripción; si no hay forma de
// saberlo, no se muestra nada (null).
function sexoLetra(it: ItemGaleria): 'M' | 'H' | null {
  if (it.sexo === 'mujer') return 'M'
  if (it.sexo === 'hombre') return 'H'
  const texto = `${it.talla ?? ''} ${it.descripcion}`.toLowerCase()
  if (/dama|mujer|niña|wmns|women/.test(texto)) return 'M'
  if (/caballero|hombre|\bmen\b/.test(texto)) return 'H'
  return null
}

// Talla limpia para la etiqueta: si es numérica (tenis) deja solo el número
// ("6.5 us dama" → "6.5"); si es de ropa (S/M/L…) la deja tal cual.
function tallaLimpia(talla: string): string {
  const num = talla.match(/\d+(?:[.,]\d+)?/)
  return num ? num[0] : talla.toUpperCase()
}

// La letra M/H solo aplica a tenis (talla numérica): en ropa la talla "M"
// (mediana) se confundiría con la M de mujer.
function esTallaNumerica(talla: string | null): boolean {
  return !!talla && /\d/.test(talla)
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

// Galería: cuadrícula de pedidos (filas de 6) y, al lado, un visor con la
// foto del pedido seleccionado EN GRANDE + sus datos completos.
export function GaleriaPedidos({
  pedidos,
  itemsPorPedido,
}: {
  pedidos: PedidoRow[]
  itemsPorPedido: Record<string, ItemGaleria[]>
}) {
  const router = useRouter()
  const [sel, setSel] = useState<PedidoRow | null>(pedidos[0] ?? null)
  const [verMovil, setVerMovil] = useState(false)

  function elegir(p: PedidoRow) {
    setSel(p)
    setVerMovil(true) // en pantallas pequeñas abre el visor encima
  }

  const imagenSel = sel ? ((sel as any).primera_imagen as string | null) : null
  const saldoSel = sel ? sel.total - sel.total_pagado : 0
  const itemsSel = sel ? (itemsPorPedido[sel.id] ?? []) : []
  // "Comprado" = el pedido ya pasó del estado pendiente (comprado, USA,
  // Bucaramanga, Santa Rosa o entregado). Pendiente = falta comprarlo.
  const yaComprado = sel ? !['pendiente', 'cancelado'].includes(sel.estado) : false
  const cancelado = sel?.estado === 'cancelado'

  const Visor = sel && (
    <div className="space-y-3">
      {/* LA FOTO EN GRANDE */}
      {imagenSel ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagenSel}
          alt={sel.numero_orden}
          className="w-full aspect-square object-cover rounded-2xl border border-gray-200 shadow-sm"
        />
      ) : (
        <div className="w-full aspect-square bg-gray-50 rounded-2xl border border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-300">
          <ImageOff size={40} />
          <span className="text-sm">Este pedido no tiene foto</span>
        </div>
      )}

      {/* Tarjeta de información */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Encabezado: número + estado de compra */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <span className="font-mono font-bold text-lg text-gray-900">{sel.numero_orden}</span>
          {cancelado ? (
            <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
              Cancelado
            </span>
          ) : yaComprado ? (
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
              <Check size={13} /> Ya comprado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full">
              <X size={13} /> Sin comprar
            </span>
          )}
        </div>

        {/* Cliente */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
            {iniciales(sel.cliente_nombre)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{sel.cliente_nombre}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
              <Phone size={11} className="shrink-0" />
              {formatearTelefono(sel.cliente_telefono)} · {formatFecha(sel.fecha_creacion)} · {sel.sede_codigo} · {ESTADO_LABELS[sel.estado]}
            </p>
          </div>
        </div>

        {/* Artículos: código + TALLA GRANDE (con M/H en tenis) */}
        {itemsSel.map((it, i) => {
          const letra = esTallaNumerica(it.talla) ? sexoLetra(it) : null
          return (
            <div key={i} className="mx-4 mb-3 bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                {it.codigo ? (
                  <span className="font-mono text-[11px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">{it.codigo}</span>
                ) : <span />}
                {it.talla && (
                  <span className="inline-flex items-stretch shrink-0">
                    <span className={`bg-amber-50 border border-amber-400 text-amber-800 text-[15px] font-bold px-2.5 py-0.5 ${letra ? 'rounded-l-lg border-r-0' : 'rounded-lg'}`}>
                      Talla {tallaLimpia(it.talla)}
                    </span>
                    {letra === 'M' && (
                      <span className="bg-pink-50 border border-pink-400 text-pink-800 text-[15px] font-bold px-2.5 py-0.5 rounded-r-lg">M</span>
                    )}
                    {letra === 'H' && (
                      <span className="bg-blue-50 border border-blue-400 text-blue-800 text-[15px] font-bold px-2.5 py-0.5 rounded-r-lg">H</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{it.marca} {it.descripcion}</p>
                  <p className="text-xs text-gray-400">{it.cantidad} unidad{it.cantidad !== 1 ? 'es' : ''}</p>
                </div>
                <span className="text-[13px] font-bold text-gray-900 shrink-0">{formatCOP(it.precio_venta * it.cantidad)}</span>
              </div>
            </div>
          )
        })}

        {/* La plata: Total / Abono / Debe */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
            <p className="text-[11px] text-gray-400">Total</p>
            <p className="text-sm font-bold text-gray-900">{formatCOP(sel.total)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg px-2 py-2 text-center">
            <p className="text-[11px] text-emerald-600">Abono</p>
            <p className="text-sm font-bold text-emerald-800">{formatCOP(sel.total_pagado)}</p>
          </div>
          {saldoSel > 0 ? (
            <div className="bg-red-50 rounded-lg px-2 py-2 text-center">
              <p className="text-[11px] text-red-500">Debe</p>
              <p className="text-sm font-bold text-red-700">{formatCOP(saldoSel)}</p>
            </div>
          ) : (
            <div className="bg-emerald-50 rounded-lg px-2 py-2 text-center">
              <p className="text-[11px] text-emerald-600">Debe</p>
              <p className="text-sm font-bold text-emerald-800">Pagado ✓</p>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={() => router.push(`/pedidos/${sel.id}`)}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
          >
            Abrir pedido <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex gap-5 items-start">
      {/* Cuadrícula: filas de 6 */}
      <div className="flex-1 min-w-0 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {pedidos.map((p) => {
          const imagen = (p as any).primera_imagen as string | null
          const activa = sel?.id === p.id
          const comprado = !['pendiente', 'cancelado'].includes(p.estado)
          return (
            <button
              key={p.id}
              onClick={() => elegir(p)}
              className={`group relative text-left bg-white rounded-xl border overflow-hidden transition-all ${
                activa ? 'border-blue-500 ring-2 ring-blue-300 shadow-md' : 'border-gray-100 shadow-sm hover:border-blue-200 hover:shadow'
              }`}
            >
              {/* Punto verde = ya comprado · rojo = sin comprar · gris = cancelado */}
              <span
                className={`absolute top-1.5 right-1.5 z-10 w-3 h-3 rounded-full ring-2 ring-white ${
                  p.estado === 'cancelado' ? 'bg-gray-400' : comprado ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              {imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagen} alt={p.numero_orden} loading="lazy" className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square bg-gray-50 flex items-center justify-center text-gray-300">
                  <ImageOff size={20} />
                </div>
              )}
              <div className="px-2 py-1.5">
                <p className="font-mono font-bold text-[11px] text-gray-900 truncate">{p.numero_orden}</p>
                <p className="text-[10px] text-gray-400 truncate">{p.cliente_nombre}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Visor lateral (pantallas grandes): la foto EN GRANDE a un lado */}
      <aside className="hidden lg:block w-[360px] xl:w-[420px] shrink-0 sticky top-20">
        {Visor ?? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            Toca un pedido para ver su foto en grande
          </div>
        )}
      </aside>

      {/* Visor móvil: overlay a pantalla completa */}
      {verMovil && sel && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => setVerMovil(false)}>
          <div className="bg-gray-50 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-3 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setVerMovil(false)}
              className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
            >
              <X size={16} />
            </button>
            {Visor}
          </div>
        </div>
      )}
    </div>
  )
}
