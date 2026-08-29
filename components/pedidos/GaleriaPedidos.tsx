'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PedidoRow } from '@/lib/queries/pedidos'
import { EstadoInline } from './PedidoCard'
import { separarPedidoAction, cambiarEstadoInlineAction, cambiarEstadoPrendaAction, marcarLlegadaPrendasAction } from '@/app/actions/pedidos'
import { transicionesDisponibles } from '@/lib/domain/estados'
import { ESTADO_LABELS, EstadoPedido } from '@/types'
import { SEGMENTO_CONFIG } from '@/components/recompras/BadgeSegmento'
import { AvisarLlegoButton } from './AvisarLlegoButton'
import { formatCOP, formatFecha } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { ImageOff, X, ArrowUpRight, Check, Phone, ShoppingCart, LayoutGrid, Package, ExternalLink, Send, Printer } from 'lucide-react'

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

// Talla limpia para la etiqueta: solo se recorta el RUIDO conocido de tenis
// ("6.5 US DAMA" → "6.5"). Antes se extraía el primer número y dañaba las
// tallas con dígito que no son de tenis: 2XS mostraba "2", 7-8 AÑOS "7".
function tallaLimpia(talla: string): string {
  const t = talla.trim().toUpperCase()
  const limpio = t
    .replace(/(\d)US\b/g, '$1')
    .replace(/\b(US|USA|DAMA|MUJER|HOMBRE|CABALLERO|NIÑO|NINO|WMNS|WOMEN|MEN)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio || t
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
  facturasCompraPorPedido = {},
  q,
  marca,
  esAdmin = false,
  puedeSeleccionar,
}: {
  pedidos: PedidoRow[]
  itemsPorPedido: Record<string, ItemGaleria[]>
  // Facturas de compra del pedido (puede traer artículos de varias compras).
  facturasCompraPorPedido?: Record<string, Array<{ id: string; numero: string | null }>>
  // Lo que se escribió en el buscador, para no mostrar los demás artículos del
  // pedido cuando la búsqueda fue por código.
  q?: string
  // Marca filtrada: igual que con el código, se muestran solo sus artículos.
  marca?: string
  esAdmin?: boolean
  // Asesores también seleccionan (crear envío / marcar llegada); el visor no.
  puedeSeleccionar?: boolean
}) {
  const router = useRouter()
  // Vista: "articulo" = una tarjeta por artículo (TR6835-1…); "pedido" = agrupada
  const [vista, setVista] = useState<'articulo' | 'pedido'>('articulo')
  const [selRef, setSelRef] = useState<string | null>(null)
  const [verMovil, setVerMovil] = useState(false)
  // Selección múltiple (admin): refs marcadas para registrar compra
  const [marcados, setMarcados] = useState<string[]>([])
  // Separar pedido en partes (un pedido por artículo, cada uno con su estado)
  const [separando, setSeparando] = useState(false)
  // Marcar llegada en lote de lo seleccionado
  const [marcandoLote, setMarcandoLote] = useState(false)

  // Quién puede usar las casillas de selección múltiple: admin y asesores
  // (el prop lo decide la página; si no viene, se mantiene el comportamiento
  // viejo de solo-admin).
  const puedeSel = puedeSeleccionar ?? esAdmin

  // Pedidos únicos detrás de las refs marcadas (una ref por artículo puede
  // repetir pedido: TR6835-1 y TR6835-2 son el mismo pedido si no está separado)
  function pedidosMarcados() {
    const map = new Map<string, PedidoRow>()
    for (const t of tiles) {
      if (marcados.includes(t.ref)) map.set(t.pedido.id, t.pedido)
    }
    return [...map.values()]
  }

  // Estado por PRENDA: separa el pedido (si hace falta) y aplica el estado a
  // la parte de ese artículo. Cada prenda queda con su propia pestaña.
  const [cambiandoPrenda, setCambiandoPrenda] = useState<number | null>(null)

  async function cambiarEstadoPrenda(pedido: PedidoRow, itemIdx: number, nuevoEstado: EstadoPedido, nItems: number) {
    const aviso = nItems > 1
      ? `Este pedido tiene ${nItems} prendas: se separará en ${nItems} pedidos (${pedido.numero_orden}-1…) y SOLO la prenda ${itemIdx + 1} pasará a "${ESTADO_LABELS[nuevoEstado]}". ¿Continuar?`
      : `¿Pasar la prenda a "${ESTADO_LABELS[nuevoEstado]}"?`
    if (!confirm(aviso)) return
    setCambiandoPrenda(itemIdx)
    const r = await cambiarEstadoPrendaAction(pedido.id, itemIdx, nuevoEstado)
    setCambiandoPrenda(null)
    if (!r.ok) { alert(r.error); return }
    alert(`✅ ${r.numeroParte} quedó en "${ESTADO_LABELS[nuevoEstado]}".`)
    router.refresh()
  }

  async function marcarLlegadaLote() {
    const EN_CAMINO = ['pendiente', 'comprado', 'usa']
    // La llegada se marca POR PRENDA: si de un pedido de varias prendas solo
    // se seleccionaron algunas, el pedido se separa y solo esas partes llegan.
    // Con todas las prendas seleccionadas, el pedido avanza completo.
    type Grupo = { pedido: PedidoRow; idxs: number[]; totalPrendas: number; refs: string[] }
    const grupos = new Map<string, Grupo>()
    for (const t of tiles) {
      let g = grupos.get(t.pedido.id)
      if (!g) { g = { pedido: t.pedido, idxs: [], totalPrendas: 0, refs: [] }; grupos.set(t.pedido.id, g) }
      g.totalPrendas += 1
      if (marcados.includes(t.ref)) {
        g.refs.push(t.ref)
        if (t.itemIdx !== null) g.idxs.push(t.itemIdx)
      }
    }
    const seleccion = [...grupos.values()].filter(g => g.refs.length > 0)
    const aMarcar = seleccion.filter(g => EN_CAMINO.includes(g.pedido.estado))
    const omitidos = seleccion.filter(g => !EN_CAMINO.includes(g.pedido.estado))
    if (aMarcar.length === 0) {
      alert('Ninguno de los seleccionados está en camino (pendiente/comprado/USA) — no hay nada que marcar.')
      return
    }
    const parciales = aMarcar.filter(g => vista === 'articulo' && g.idxs.length > 0 && g.refs.length < g.totalPrendas)
    if (!confirm(
      `¿Marcar como LLEGÓ A BUCARAMANGA?\n\n` +
      aMarcar.flatMap(g => g.refs).join(', ') +
      (parciales.length > 0
        ? `\n\n✂️ OJO: ${parciales.map(g => g.pedido.numero_orden).join(', ')} se separará(n) por prendas — SOLO llegan las seleccionadas, las demás siguen en camino.`
        : '') +
      (omitidos.length > 0 ? `\n\nSe omiten (ya en sede/entregados): ${omitidos.map(g => g.pedido.numero_orden).join(', ')}` : '')
    )) return
    setMarcandoLote(true)
    const errores: string[] = []
    let marcadasTotal = 0
    for (const g of aMarcar) {
      const esParcial = vista === 'articulo' && g.idxs.length > 0 && g.refs.length < g.totalPrendas
      if (esParcial) {
        const r = await marcarLlegadaPrendasAction(g.pedido.id, g.idxs)
        if (!r.ok) errores.push(`${g.pedido.numero_orden}: ${r.error}`)
        else marcadasTotal += r.partes.length
      } else {
        const r = await cambiarEstadoInlineAction(g.pedido.id, g.pedido.estado as any, 'bucaramanga')
        if (!r.ok) errores.push(`${g.pedido.numero_orden}: ${r.error}`)
        else marcadasTotal += 1
      }
    }
    setMarcandoLote(false)
    setMarcados([])
    alert(errores.length === 0
      ? `✅ ${marcadasTotal} marcado(s) en Bucaramanga.`
      : `Marcados ${marcadasTotal}. Con error:\n${errores.join('\n')}`)
    router.refresh()
  }

  async function separarPedido(pedidoId: string, numeroOrden: string) {
    if (!confirm(
      `¿Separar ${numeroOrden} en un pedido por artículo?\n\n` +
      `Cada artículo queda como pedido aparte (${numeroOrden}-1, ${numeroOrden}-2…) ` +
      `con su PROPIO estado — útil cuando llegan en tiempos distintos. ` +
      `Los abonos se reparten solos y no se puede deshacer.`
    )) return
    setSeparando(true)
    const r = await separarPedidoAction(pedidoId)
    setSeparando(false)
    if (!r.ok) { alert(r.error); return }
    alert(`Listo: quedó separado en ${r.partes.length} pedidos (${r.partes.join(', ')}). Ya puedes cambiarle el estado a cada uno.`)
    router.refresh()
  }

  const tiles: Tile[] = useMemo(() => {
    const out: Tile[] = []
    const buscado = (q ?? '').trim().toUpperCase()
    const marcaBuscada = (marca ?? '').trim().toLowerCase()
    for (const p of pedidos) {
      const imagenPedido = (p as any).primera_imagen as string | null
      const items = itemsPorPedido[p.id] ?? []
      const pedidoComprado = !['pendiente', 'cancelado'].includes(p.estado)
      // Si el pedido ya tiene FACTURA, se da por comprado (la mercancía ya
      // se entregó/vendió) aunque no tenga compra de proveedor registrada.
      const facturado = !!p.factura_id

      // Al buscar por CÓDIGO, la búsqueda trae el pedido completo, así que sin
      // esto salían también los demás artículos de ese pedido (buscar el On
      // mostraba el Nike y el Salomon que venían en el mismo pedido). Se filtran
      // los que no coinciden — pero solo si alguno coincide, para que buscar por
      // cliente o por número de orden siga mostrando el pedido entero.
      const coincidePorCodigo = buscado
        ? items.some(it => (it.codigo ?? '').toUpperCase().includes(buscado))
        : false

      // Igual con la marca: si se filtró por marca, solo se ven sus artículos.
      const esDeLaMarca = (it: ItemGaleria) =>
        (it.marca ?? '').trim().toLowerCase() === marcaBuscada
      const coincidePorMarca = marcaBuscada ? items.some(esDeLaMarca) : false

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
          if (coincidePorCodigo && !(it.codigo ?? '').toUpperCase().includes(buscado)) return
          if (coincidePorMarca && !esDeLaMarca(it)) return
          out.push({
            // El sufijo usa el índice REAL dentro del pedido, no el del listado
            // filtrado: el artículo 2 sigue siendo "-2" aunque el 1 no se muestre.
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
  }, [pedidos, itemsPorPedido, vista, q, marca])

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
  // "Ya comprado" sale de las COMPRAS REGISTRADAS (igual que el recuadro rojo de
  // las tarjetas) o de que el pedido ya esté FACTURADO — no del estado, así no
  // se contradice si marcan USA sin registrar compra.
  const yaComprado = sel
    ? (!!sel.pedido.factura_id ||
       (itemsSel.length > 0
        ? itemsSel.every(it => it.comprado)
        : !['pendiente', 'cancelado'].includes(sel.pedido.estado)))
    : false
  const cancelado = sel?.pedido.estado === 'cancelado'
  // Facturas de compra del pedido seleccionado, para abrirlas desde el badge.
  const facturasSel = sel ? (facturasCompraPorPedido[sel.pedido.id] ?? []) : []

  const Visor = sel && (
    <div className="space-y-3">
      {/* LA FOTO EN GRANDE (la del artículo elegido) */}
      {sel.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sel.imagen}
          alt={sel.ref}
          className="w-full aspect-square object-cover rounded-2xl border border-gray-200 shadow-sm"
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
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-lg text-gray-900">{sel.ref}</span>
            {!!sel.pedido.factura_id && !cancelado && (
              <span className="inline-flex items-center bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                Facturado
              </span>
            )}
          </span>
          {cancelado ? (
            <span className="inline-flex items-center gap-1 bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
              Cancelado
            </span>
          ) : !esAdmin ? null : (sel.item ? (sel.comprado || !!sel.pedido.factura_id) : yaComprado) ? (
            // Ya comprado: si se sabe de qué compra vino, el badge lleva el
            // número de factura y abre esa compra. Si vino de varias, se listan.
            facturasSel.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                {facturasSel.map(f => (
                  <Link
                    key={f.id}
                    href={`/compras/${f.id}`}
                    title="Abrir la factura de compra"
                    className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full hover:bg-emerald-200 transition-colors"
                  >
                    <Check size={13} />
                    {f.numero ? `Fac ${f.numero}` : 'Ver compra'}
                    <ExternalLink size={11} className="opacity-70" />
                  </Link>
                ))}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
                <Check size={13} /> Ya comprado
              </span>
            )
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
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{sel.pedido.cliente_nombre}</p>
              {sel.pedido.cliente_segmento && SEGMENTO_CONFIG[sel.pedido.cliente_segmento] && (
                <span
                  title={SEGMENTO_CONFIG[sel.pedido.cliente_segmento].queHacer}
                  className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0 ${SEGMENTO_CONFIG[sel.pedido.cliente_segmento].clases}`}
                >
                  <span aria-hidden="true">{SEGMENTO_CONFIG[sel.pedido.cliente_segmento].icono}</span>
                  {SEGMENTO_CONFIG[sel.pedido.cliente_segmento].label}
                </span>
              )}
            </div>
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

        {/* Con varios artículos, se puede separar para dar estado a cada uno
            (llegan en tiempos distintos). No aplica si ya está facturado. */}
        {itemsSel.length > 1 && !sel.pedido.factura_id && (
          <button
            onClick={() => separarPedido(sel.pedido.id, sel.pedido.numero_orden)}
            disabled={separando}
            className="mx-4 mb-3 flex items-center justify-center gap-1.5 w-[calc(100%-2rem)] text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-3 py-2 disabled:opacity-50"
          >
            ✂️ {separando ? 'Separando…' : `Separar en ${itemsSel.length} pedidos (estado propio por artículo)`}
          </button>
        )}

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
              {/* Estado de ESTA prenda: al usarlo el pedido se separa solo y el
                  estado aplica únicamente a este artículo. Solo con 2+ prendas
                  y sin facturar (facturado se maneja completo). */}
              {itemsSel.length > 1 && !sel.pedido.factura_id && puedeSel && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-gray-400 shrink-0">Estado de esta prenda:</span>
                  <select
                    value=""
                    disabled={cambiandoPrenda !== null}
                    onChange={e => {
                      const v = e.target.value as EstadoPedido
                      if (v) cambiarEstadoPrenda(sel.pedido, i, v, itemsSel.length)
                      e.target.value = ''
                    }}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                  >
                    <option value="">
                      {cambiandoPrenda === i ? 'Cambiando…' : `${ESTADO_LABELS[sel.pedido.estado as EstadoPedido] ?? sel.pedido.estado} → elegir…`}
                    </option>
                    {transicionesDisponibles(sel.pedido.estado as EstadoPedido, esAdmin ? 'admin' : 'asesor')
                      .filter(est => est !== 'entregado' && est !== 'cancelado')
                      .map(est => (
                        <option key={est} value={est}>{ESTADO_LABELS[est]}</option>
                      ))}
                  </select>
                </div>
              )}
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

        <div className="px-4 pb-4 space-y-2">
          <AvisarLlegoButton
            estado={sel.pedido.estado}
            telefono={sel.pedido.cliente_telefono}
            saldo={saldoSel}
            variante="ancho"
          />
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
            // Recuadro VERDE = ya entregado (lo ven admin y asesores).
            const esEntregado = t.pedido.estado === 'entregado'
            // Recuadro ROJO = falta comprarlo. Reemplaza al punto de color, que
            // era chiquito y había que buscarlo. Solo lo ve el admin: es
            // información de compras.
            const faltaComprar = esAdmin && !esCancelado && !esEntregado && !t.comprado
            return (
              <button
                key={t.ref}
                onClick={() => elegir(t)}
                title={faltaComprar ? 'Sin comprar' : esCancelado ? 'Cancelado' : esEntregado ? 'Entregado' : esAdmin ? 'Ya comprado' : undefined}
                // El BORDE dice el estado de compra y el ANILLO lo que está
                // seleccionado, así los dos se leen a la vez y no se tapan.
                // El grosor es siempre 2 para que la tarjeta no cambie de tamaño
                // cuando cambia de estado.
                className={`group relative text-left bg-white rounded-xl border-2 overflow-hidden transition-all ${
                  faltaComprar ? 'border-red-500'
                  : esEntregado ? 'border-emerald-500'
                  : esCancelado ? 'border-gray-300'
                  : 'border-gray-200'
                } ${
                  marcado ? 'ring-2 ring-purple-400 shadow-md'
                  : activa ? 'ring-2 ring-blue-400 shadow-md'
                  : 'shadow-sm hover:shadow'
                }`}
              >
                {/* Casilla de selección: marcar varios para compra (admin),
                    crear envío o marcar llegada en lote (admin y asesores) */}
                {puedeSel && !esCancelado && (
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
                {/* Cinta "Facturado": el pedido ya tiene factura de venta — o sea
                    ya se vendió/entregó, aunque no tenga compra registrada. */}
                {!!t.pedido.factura_id && !esCancelado && (
                  <span className="absolute top-1.5 right-1.5 z-10 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                    Facturado
                  </span>
                )}
                {t.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imagen} alt={t.ref} loading="lazy" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gray-50 flex items-center justify-center text-gray-300">
                    <ImageOff size={20} />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  {/* La talla va ARRIBA, junto al número: al final de la línea
                      del cliente se cortaba cuando el nombre era largo. */}
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-mono font-bold text-[11px] text-gray-900 truncate">{t.ref}</p>
                    {t.item?.talla && (
                      <span className="shrink-0 text-[10px] font-bold bg-amber-50 border border-amber-400 text-amber-800 px-1.5 rounded-md">
                        T: {tallaLimpia(t.item.talla)}
                      </span>
                    )}
                  </div>
                  {t.item?.codigo && (
                    <p className="font-mono font-bold text-[10px] text-blue-700 truncate">{t.item.codigo}</p>
                  )}
                  <p className="text-[10px] text-gray-400 truncate">
                    {t.pedido.cliente_segmento && SEGMENTO_CONFIG[t.pedido.cliente_segmento]
                      ? `${SEGMENTO_CONFIG[t.pedido.cliente_segmento].icono} `
                      : ''}
                    {t.pedido.cliente_nombre}
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

      {/* Barra flotante con lo marcado: compra (admin), envío o llegada (todos) */}
      {puedeSel && marcados.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl shadow-xl px-3 py-2 print:hidden max-w-[95vw]">
          <span className="text-sm font-semibold whitespace-nowrap">
            {marcados.length} seleccionado{marcados.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setMarcados([])}
            className="text-xs text-gray-300 hover:text-white underline"
          >
            Limpiar
          </button>
          <button
            onClick={() => router.push(`/envios/nuevo?pedidos=${marcados.join(',')}`)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-3.5 py-2 rounded-xl transition-colors"
          >
            <Send size={15} />
            Crear envío
          </button>
          <button
            onClick={() => window.open(`/pedidos/etiquetas?ids=${pedidosMarcados().map(p => p.id).join(',')}`, '_blank')}
            className="flex items-center gap-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold px-3.5 py-2 rounded-xl transition-colors"
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            onClick={marcarLlegadaLote}
            disabled={marcandoLote}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Check size={15} strokeWidth={3} />
            {marcandoLote ? 'Marcando…' : 'Llegó a Bucaramanga'}
          </button>
          {esAdmin && (
            <button
              onClick={() => router.push(`/compras/nueva?pedidos=${marcados.join(',')}`)}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-3.5 py-2 rounded-xl transition-colors"
            >
              <ShoppingCart size={15} />
              Registrar compra
            </button>
          )}
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
