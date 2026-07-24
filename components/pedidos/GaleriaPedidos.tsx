'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoInline } from './PedidoCard'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ImageOff, X, ArrowUpRight, Check, Phone, ShoppingCart, LayoutGrid, Package } from 'lucide-react'

export type ItemGaleria = {
  codigo: string | null
  marca: string
  descripcion: string
  talla: string | null
  cantidad: number
  precio_venta: number
  sexo: string | null
  categoria: string | null
  imagen_url: string | null
  articulo_id: string | null
  comprado: boolean
}

// Una tarjeta de la cuadrícula: en la vista "por artículo" cada artículo del
// pedido es su propia tarjeta con consecutivo interno (TR6835-1, TR6835-2…);
// en la vista "por pedido" hay una tarjeta por pedido.
type Tile = {
  ref: string                 // TR6835 o TR6835-2 (lo que se manda a compras)
  pedido: PedidoRow
  item: ItemGaleria | null    // null en vista por pedido
  itemIdx: number | null
  imagen: string | null
  comprado: boolean
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

export function GaleriaPedidos({
  pedidos,
  itemsPorPedido,
  esAdmin = false,
}: {
  pedidos: PedidoRow[]
  itemsPorPedido: Record<string, ItemGaleria[]>
  esAdmin?: boolean
}) {
  const router = useRouter()
  // Vista: "articulo" = una tarjeta por artículo (TR6835-1…); "pedido" = agrupada
  const [vista, setVista] = useState<'articulo' | 'pedido'>('articulo')
  const [selRef, setSelRef] = useState<string | null>(null)
  const [verMovil, setVerMovil] = useState(false)
  // Selección múltiple (admin): refs marcadas para registrar compra
  const [marcados, setMarcados] = useState<string[]>([])

  const tiles: Tile[] = useMemo(() => {
    const out: Tile[] = []
    for (const p of pedidos) {
      const imagenPedido = (p as any).primera_imagen as string | null
      const items = itemsPorPedido[p.id] ?? []
      const pedidoComprado = !['pendiente', 'cancelado'].includes(p.estado)
      // Si el pedido ya tiene FACTURA, se da por comprado (la mercancía ya
      // se entregó/vendió) aunque no tenga compra de proveedor registrada.
      const facturado = !!p.factura_id
      if (vista === 'pedido' || items.length === 0) {
        out.push({
          ref: p.numero_orden,
          pedido: p,
          item: null,
          itemIdx: null,
          imagen: imagenPedido,
          comprado: facturado || (vista === 'pedido'
            ? (items.length > 0 ? items.every(it => it.comprado) : pedidoComprado)
            : pedidoComprado),
        })
      } else {
        items.forEach((it, i) => {
          out.push({
            ref: items.length > 1 ? `${p.numero_orden}-${i + 1}` : p.numero_orden,
            pedido: p,
            item: it,
            itemIdx: i,
            imagen: it.imagen_url ?? imagenPedido,
            comprado: facturado || it.comprado,
          })
        })
      }
    }
    return out
  }, [pedidos, itemsPorPedido, vista])

  const sel = tiles.find(t => t.ref === selRef) ?? tiles[0] ?? null

  function elegir(t: Tile) {
    setSelRef(t.ref)
    setVerMovil(true) // en pantallas pequeñas abre el visor encima
  }

  function toggleMarcado(ref: string) {
    setMarcados(prev => prev.includes(ref) ? prev.filter(n => n !== ref) : [...prev, ref])
  }

  const saldoSel = sel ? sel.pedido.total - sel.pedido.total_pagado : 0
  const itemsSel = sel ? (itemsPorPedido[sel.pedido.id] ?? []) : []
  // "Ya comprado" sale de las COMPRAS REGISTRADAS (igual que los punticos) o
  // de que el pedido ya esté FACTURADO — no del estado, así no se contradice
  // si marcan USA sin registrar compra.
  const yaComprado = sel
    ? (!!sel.pedido.factura_id ||
       (itemsSel.length > 0
        ? itemsSel.every(it => it.comprado)
        : !['pendiente', 'cancelado'].includes(sel.pedido.estado)))
    : false
  const cancelado = sel?.pedido.estado === 'cancelado'

  const Visor = sel && (
    <div className="space-y-3">
      {/* LA FOTO EN GRANDE (la del artículo elegido) */}
      {sel.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sel.imagen}
          alt={sel.ref}
          className="w-full aspect-square object-contain bg-white rounded-2xl border border-gray-200 shadow-sm"
        />
      ) : (
        <div className="w-full aspect-square bg-gray-50 rounded-2xl border border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-300">
          <ImageOff size={40} />
          <span className="text-sm">Sin foto</span>
        </div>
      )}

      {/* Tarjeta de información */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Encabezado: ref + estado de compra */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <span className="font-mono font-bold text-lg text-gray-900">{sel.ref}</span>
          {cancelado ? (
            <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
              Cancelado
            </span>
          ) : !esAdmin ? null : (sel.item ? (sel.comprado || !!sel.pedido.factura_id) : yaComprado) ? (
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
            {iniciales(sel.pedido.cliente_nombre)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{sel.pedido.cliente_nombre}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
              <Phone size={11} className="shrink-0" />
              {formatearTelefono(sel.pedido.cliente_telefono)} · {formatFecha(sel.pedido.fecha_creacion)} · {sel.pedido.sede_codigo}
            </p>
          </div>
        </div>

        {/* Estado del pedido: clic para cambiarlo aquí mismo */}
        <div className="flex items-center justify-between gap-2 mx-4 mb-3 bg-gray-50 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-500 font-medium">Estado del pedido</span>
          <EstadoInline
            key={sel.pedido.id}
            pedidoId={sel.pedido.id}
            estadoActual={sel.pedido.estado}
            sedeCodigo={sel.pedido.sede_codigo}
            esAdmin={esAdmin}
            facturado={!!sel.pedido.factura_id}
          />
        </div>

        {/* Artículos: el elegido queda resaltado */}
        {itemsSel.map((it, i) => {
          const letra = esTallaNumerica(it.talla) ? sexoLetra(it) : null
          const esElElegido = sel.itemIdx === i
          return (
            <div
              key={i}
              className={`mx-4 mb-3 rounded-xl p-3 ${
                esElElegido ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {itemsSel.length > 1 && (
                    <span className="font-mono text-[11px] font-bold text-gray-400 shrink-0">-{i + 1}</span>
                  )}
                  {it.codigo ? (
                    <span className="font-mono text-[11px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md truncate">{it.codigo}</span>
                  ) : null}
                  {esAdmin && (it.comprado
                    ? <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Ya comprado" />
                    : <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" title="Sin comprar" />)}
                </span>
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

        {/* La plata: Total / Abono / Debe (del pedido completo) */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
            <p className="text-[11px] text-gray-400">Total</p>
            <p className="text-sm font-bold text-gray-900">{formatCOP(sel.pedido.total)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg px-2 py-2 text-center">
            <p className="text-[11px] text-emerald-600">Abono</p>
            <p className="text-sm font-bold text-emerald-800">{formatCOP(sel.pedido.total_pagado)}</p>
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
            onClick={() => router.push(`/pedidos/${sel.pedido.id}`)}
            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
          >
            Abrir pedido <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Selector de vista */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => { setVista('articulo'); setMarcados([]) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            vista === 'articulo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid size={13} /> Por artículo
        </button>
        <button
          onClick={() => { setVista('pedido'); setMarcados([]) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            vista === 'pedido' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package size={13} /> Por pedido
        </button>
      </div>

      <div className="flex gap-5 items-start">
        {/* Cuadrícula: filas de 6 */}
        <div className="flex-1 min-w-0 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {tiles.map((t) => {
            const activa = sel?.ref === t.ref
            const marcado = marcados.includes(t.ref)
            const esCancelado = t.pedido.estado === 'cancelado'
            return (
              <button
                key={t.ref}
                onClick={() => elegir(t)}
                className={`group relative text-left bg-white rounded-xl border overflow-hidden transition-all ${
                  marcado ? 'border-purple-500 ring-2 ring-purple-300 shadow-md'
                  : activa ? 'border-blue-500 ring-2 ring-blue-300 shadow-md'
                  : 'border-gray-100 shadow-sm hover:border-blue-200 hover:shadow'
                }`}
              >
                {/* Punto verde = ya comprado · rojo = sin comprar · gris = cancelado.
                    Es información de compras: SOLO la ve el admin. */}
                {esAdmin && (
                  <span
                    className={`absolute top-1.5 right-1.5 z-10 w-3 h-3 rounded-full ring-2 ring-white ${
                      esCancelado ? 'bg-gray-400' : t.comprado ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                )}
                {/* Casilla de selección (admin): marcar varios para registrar compra */}
                {esAdmin && !esCancelado && (
                  <span
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={(e) => { e.stopPropagation(); toggleMarcado(t.ref) }}
                    className={`absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-md flex items-center justify-center border-2 cursor-pointer transition-colors ${
                      marcado
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-white/90 border-gray-300 text-transparent hover:border-purple-400'
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
                {t.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imagen} alt={t.ref} loading="lazy" className="w-full aspect-square object-contain bg-white" />
                ) : (
                  <div className="w-full aspect-square bg-gray-50 flex items-center justify-center text-gray-300">
                    <ImageOff size={20} />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="font-mono font-bold text-[11px] text-gray-900 truncate">{t.ref}</p>
                  {t.item?.codigo && (
                    <p className="font-mono font-bold text-[10px] text-blue-700 truncate">{t.item.codigo}</p>
                  )}
                  <p className="text-[10px] text-gray-400 truncate">
                    {t.pedido.cliente_nombre}
                    {t.item?.talla ? ` · T ${tallaLimpia(t.item.talla)}` : ''}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Visor lateral (pantallas grandes): la foto EN GRANDE a un lado */}
        <aside className="hidden lg:block w-[360px] xl:w-[420px] shrink-0 sticky top-20">
          {Visor ?? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Toca un artículo para ver su foto en grande
            </div>
          )}
        </aside>
      </div>

      {/* Barra flotante: registrar la compra de lo marcado */}
      {esAdmin && marcados.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-xl pl-4 pr-2 py-2 print:hidden">
          <span className="text-sm font-semibold whitespace-nowrap">
            {marcados.length} artículo{marcados.length !== 1 ? 's' : ''} seleccionado{marcados.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setMarcados([])}
            className="text-xs text-gray-300 hover:text-white underline"
          >
            Limpiar
          </button>
          <button
            onClick={() => router.push(`/compras/nueva?pedidos=${marcados.join(',')}`)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            <ShoppingCart size={15} />
            Registrar compra
          </button>
        </div>
      )}

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
