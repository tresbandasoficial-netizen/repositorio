'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  buscarPedidoParaEnvioAction,
  buscarArticuloParaEnvioAction,
  crearEnvioAction,
  ItemEnvioInput,
  PedidoEnvio,
} from '@/app/actions/envios'
import { buscarArticulosAction } from '@/app/actions/articulos'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { EstadoPedido } from '@/types'
import { Loader2, Package, Barcode, Plus, Trash2, Send, Search } from 'lucide-react'

// Opción del buscador de catálogo, aplanada por talla disponible.
type OpcionArt = {
  codigo: string | null
  descripcion: string   // marca + nombre (+ color)
  talla: string | null
  stock: number | null
}

type ItemLista =
  | { tipo: 'pedido'; pedido_id: string; numero_orden: string; descripcion: string; estado: string; articulo: string | null }
  | { tipo: 'articulo'; codigo: string; talla: string | null; cantidad: number; descripcion: string | null; enCatalogo: boolean }

// Un pedido de VARIOS artículos entra al envío como una fila por artículo
// (TR6835-1, TR6835-2…), cada una quitable por separado: a veces no llegan
// todos a tiempo y el resto viaja en otra remisión. Con sufijo escaneado
// (etiqueta por unidad) entra SOLO ese artículo; el sufijo que coincide con
// un pedido real (separado) se respeta tal cual.
type FilaPedido = Extract<ItemLista, { tipo: 'pedido' }>

function filasDePedido(numEscaneado: string, pedido: PedidoEnvio): FilaPedido[] {
  const base = {
    tipo: 'pedido' as const,
    pedido_id: pedido.id,
    descripcion: pedido.cliente_nombre,
    estado: pedido.estado,
  }
  const etiqueta = (it: { marca: string | null; descripcion: string | null; talla: string | null }) =>
    [it.marca, it.descripcion, it.talla ? `T${it.talla}` : null].filter(Boolean).join(' ') || null

  const m = numEscaneado.match(/-(\d+)$/)
  const esParteReal = pedido.numero_orden.toUpperCase() === numEscaneado.toUpperCase()
  if (m && !esParteReal) {
    const n = parseInt(m[1], 10)
    const prod = pedido.items[n - 1]
    return [{
      ...base,
      numero_orden: `${pedido.numero_orden}-${n}`,
      articulo: prod ? etiqueta(prod) : null,
    }]
  }
  if (pedido.items.length > 1) {
    return pedido.items.map((prod, i) => ({
      ...base,
      numero_orden: `${pedido.numero_orden}-${i + 1}`,
      articulo: etiqueta(prod),
    }))
  }
  return [{ ...base, numero_orden: pedido.numero_orden, articulo: pedido.items[0] ? etiqueta(pedido.items[0]) : null }]
}

export function EnvioBuilder({ sedes, sedeOrigenId, pedidosIniciales }: {
  sedes: { id: string; codigo: string; nombre: string }[]
  sedeOrigenId: string | null
  // Números de pedido pre-marcados desde la galería: se cargan solos al abrir.
  pedidosIniciales?: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [guardando, setGuardando] = useState(false)
  const [cargandoIniciales, setCargandoIniciales] = useState(false)
  const inicialesCargados = useRef(false)

  // Destino por defecto: Santa Rosa
  const sedeSR = sedes.find(s => s.codigo === 'SR')
  const [destino, setDestino] = useState<string>(sedeSR?.id ?? sedes[0]?.id ?? '')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemLista[]>([])
  const [error, setError] = useState<string | null>(null)

  // Escaneo de pedidos
  const [numeroPedido, setNumeroPedido] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  // Artículo suelto: buscador del catálogo + talla + cantidad
  const [busquedaArt, setBusquedaArt] = useState('')
  const [opcionesArt, setOpcionesArt] = useState<OpcionArt[]>([])
  const [buscandoArt, setBuscandoArt] = useState(false)
  const [openArt, setOpenArt] = useState(false)
  const [artSel, setArtSel] = useState<{ codigo: string | null; descripcion: string } | null>(null)
  const [tallaArt, setTallaArt] = useState('')
  const [cantArt, setCantArt] = useState(1)
  const artTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onBusquedaArtChange(valor: string) {
    setBusquedaArt(valor)
    setArtSel(null) // al editar el texto se descarta la selección previa
    if (artTimerRef.current) clearTimeout(artTimerRef.current)
    const q = valor.trim()
    if (q.length < 2) { setOpcionesArt([]); setOpenArt(false); return }
    artTimerRef.current = setTimeout(async () => {
      setBuscandoArt(true)
      try {
        const arts = await buscarArticulosAction(q, null)
        const opts: OpcionArt[] = []
        for (const a of arts) {
          const desc = `${a.marca} ${a.nombre}${a.color ? ` ${a.color}` : ''}`.trim()
          if (a.tallaStock.length === 0) {
            opts.push({ codigo: a.codigo, descripcion: desc, talla: null, stock: null })
          } else {
            for (const ts of a.tallaStock) {
              opts.push({ codigo: a.codigo, descripcion: desc, talla: ts.talla, stock: ts.stock })
            }
          }
        }
        // El código de producto manda: exacto primero, luego prefijo, luego contiene.
        const qUp = q.toUpperCase()
        const prioridad = (codigo: string | null) => {
          const c = (codigo ?? '').toUpperCase()
          if (!c) return 3
          if (c === qUp) return 0
          if (c.startsWith(qUp)) return 1
          if (c.includes(qUp)) return 2
          return 3
        }
        opts.sort((a, b) => prioridad(a.codigo) - prioridad(b.codigo))
        setOpcionesArt(opts)
        setOpenArt(true)
        setError(null)
      } catch (e) {
        // Típico tras un despliegue con la página abierta: recargar lo resuelve.
        console.error('Error buscando artículos:', e)
        setError('No se pudo buscar. Recarga la página (Ctrl+Shift+R) e intenta de nuevo.')
      } finally {
        setBuscandoArt(false)
      }
    }, 350)
  }

  function elegirArticulo(opt: OpcionArt) {
    setArtSel({ codigo: opt.codigo, descripcion: opt.descripcion })
    setBusquedaArt(`${opt.codigo ? `${opt.codigo} · ` : ''}${opt.descripcion}`)
    if (opt.talla) setTallaArt(opt.talla)
    setOpenArt(false)
  }

  // Carga los pedidos que vienen pre-marcados desde la galería (una sola vez).
  useEffect(() => {
    if (inicialesCargados.current) return
    inicialesCargados.current = true
    const nums = (pedidosIniciales ?? []).filter(Boolean)
    if (nums.length === 0) return
    ;(async () => {
      setCargandoIniciales(true)
      const fallidos: string[] = []
      for (const num of nums) {
        const r = await buscarPedidoParaEnvioAction(num)
        if (!r.ok) { fallidos.push(num); continue }
        const filas = filasDePedido(num, r.pedido)
        setItems(prev => [
          ...prev,
          ...filas.filter(f => !prev.some(it => it.tipo === 'pedido' && it.numero_orden === f.numero_orden)),
        ])
      }
      if (fallidos.length > 0) setError(`No se pudieron agregar: ${fallidos.join(', ')}`)
      setCargandoIniciales(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function agregarPedido() {
    const num = numeroPedido.trim().toUpperCase()
    if (!num) return
    if (items.some(it => it.tipo === 'pedido' && it.numero_orden === num)) {
      setError(`El pedido ${num} ya está en la lista`)
      setNumeroPedido('')
      return
    }
    startTransition(async () => {
      setError(null)
      const r = await buscarPedidoParaEnvioAction(num)
      if (!r.ok) { setError(r.error) }
      else {
        const filas = filasDePedido(num, r.pedido)
        setItems(prev => {
          const nuevas = filas.filter(f => !prev.some(it => it.tipo === 'pedido' && it.numero_orden === f.numero_orden))
          if (nuevas.length === 0) setError(`El pedido ${num} ya está en la lista`)
          return [...prev, ...nuevas]
        })
      }
      setNumeroPedido('')
      scanRef.current?.focus()
    })
  }

  function agregarArticulo() {
    // Con artículo elegido del catálogo: usar sus datos directamente.
    if (artSel) {
      setItems(prev => [...prev, {
        tipo: 'articulo',
        codigo: artSel.codigo ?? '—',
        talla: tallaArt.trim() || null,
        cantidad: Math.max(1, cantArt),
        descripcion: artSel.descripcion,
        enCatalogo: true,
      }])
      setArtSel(null)
      setBusquedaArt('')
      setOpcionesArt([])
      setTallaArt('')
      setCantArt(1)
      return
    }
    // Sin selección: tratar lo escrito como código exacto (permite fuera de catálogo).
    const cod = busquedaArt.trim().toUpperCase()
    if (!cod) return
    startTransition(async () => {
      setError(null)
      const a = await buscarArticuloParaEnvioAction(cod)
      setItems(prev => [...prev, {
        tipo: 'articulo',
        codigo: a.codigo,
        talla: tallaArt.trim() || null,
        cantidad: Math.max(1, cantArt),
        descripcion: a.descripcion || null,
        enCatalogo: a.encontrado,
      }])
      setBusquedaArt('')
      setOpcionesArt([])
      setOpenArt(false)
      setTallaArt('')
      setCantArt(1)
    })
  }

  function quitar(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function guardar() {
    if (items.length === 0) { setError('Agrega al menos un pedido o artículo'); return }
    setGuardando(true)
    startTransition(async () => {
      setError(null)
      const payload: ItemEnvioInput[] = items.map(it => it.tipo === 'pedido'
        ? { tipo: 'pedido', pedido_id: it.pedido_id, numero_orden: it.numero_orden, descripcion: it.descripcion }
        : { tipo: 'articulo', codigo: it.codigo, talla: it.talla, cantidad: it.cantidad, descripcion: it.descripcion })
      const r = await crearEnvioAction({ destino_sede_id: destino, notas, items: payload })
      if (!r.ok) { setError(r.error); setGuardando(false) }
      else router.push(`/envios/${r.envioId}`)
    })
  }

  // Filas partidas del mismo pedido (TR6835-1, TR6835-2) cuentan como UN pedido.
  const numPedidos = new Set(items.filter(i => i.tipo === 'pedido').map(i => (i as Extract<ItemLista, { tipo: 'pedido' }>).pedido_id)).size
  const numArticulos = items.filter(i => i.tipo === 'articulo').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Columna izquierda: captura */}
      <div className="lg:col-span-1 space-y-4">
        {/* Destino */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Destino</p>
          <select
            value={destino}
            onChange={e => setDestino(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sedes.filter(s => s.id !== sedeOrigenId).map(s => (
              <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>
            ))}
          </select>
        </div>

        {/* Escanear pedidos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Barcode size={13} /> Escanear pedido
          </p>
          <div className="flex gap-2">
            <input
              ref={scanRef}
              type="text"
              value={numeroPedido}
              onChange={e => setNumeroPedido(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarPedido() } }}
              placeholder="Escanea el código o escribe TR6722…"
              autoFocus
              className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:font-sans"
            />
            <button
              onClick={agregarPedido}
              disabled={isPending || !numeroPedido.trim()}
              className="shrink-0 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">Con lector: escanea la etiqueta y se agrega solo (el lector envía Enter).</p>
        </div>

        {/* Artículo suelto: buscador del catálogo */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Package size={13} /> Artículo (no pedido)
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={busquedaArt}
              onChange={e => onBusquedaArtChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarArticulo() } }}
              onFocus={() => { if (opcionesArt.length > 0 && !artSel) setOpenArt(true) }}
              placeholder="Buscar en el catálogo: JD4546, marca, nombre…"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${artSel ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}
            />
            {buscandoArt && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
            )}

            {/* Resultados del catálogo */}
            {openArt && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto">
                {opcionesArt.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-gray-400">
                    Sin resultados — puedes agregarlo igual con el botón (queda como código libre)
                  </p>
                ) : opcionesArt.map((opt, i) => (
                  <button
                    key={`${opt.codigo ?? 'x'}-${opt.talla ?? ''}-${i}`}
                    onClick={() => elegirArticulo(opt)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                  >
                    {opt.codigo && <span className="font-mono font-bold text-gray-900 shrink-0">{opt.codigo}</span>}
                    <span className="text-gray-600 truncate flex-1">{opt.descripcion}</span>
                    {opt.talla && <span className="text-gray-500 shrink-0">T{opt.talla}</span>}
                    {opt.stock !== null && (
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${opt.stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {opt.stock > 0 ? `${opt.stock} en stock` : 'sin stock'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {artSel && (
            <p className="text-xs text-green-600 font-medium">✓ Del catálogo: {artSel.descripcion}</p>
          )}

          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <input
              type="text"
              value={tallaArt}
              onChange={e => setTallaArt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarArticulo() } }}
              placeholder="Talla"
              className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              min={1}
              value={cantArt}
              onChange={e => setCantArt(Math.max(1, parseInt(e.target.value) || 1))}
              title="Cantidad"
              className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={agregarArticulo}
            disabled={isPending || !busquedaArt.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Plus size={14} /> Agregar artículo
          </button>
        </div>

        {/* Notas */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notas</p>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="Opcional: transportadora, guía, observaciones…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Columna derecha: lista del envío */}
      <div className="lg:col-span-2 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {cargandoIniciales && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Cargando los pedidos seleccionados en la galería…
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">Contenido del envío</p>
            <p className="text-xs text-gray-400">{numPedidos} pedido{numPedidos !== 1 ? 's' : ''} · {numArticulos} artículo{numArticulos !== 1 ? 's' : ''}</p>
          </div>

          {items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">
              Escanea pedidos o agrega artículos — irán apareciendo aquí
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-6 text-xs text-gray-300 font-medium text-right shrink-0">{i + 1}</span>
                  {it.tipo === 'pedido' ? (
                    <>
                      <span className="font-mono font-bold text-sm text-gray-900 w-24 shrink-0">{it.numero_orden}</span>
                      <span className="flex-1 min-w-0 text-sm text-gray-600">
                        <span className="block truncate">{it.descripcion}</span>
                        {it.articulo && (
                          <span className="block truncate text-xs text-gray-400">{it.articulo}</span>
                        )}
                      </span>
                      <EstadoBadge estado={it.estado as EstadoPedido} enAlerta={false} />
                    </>
                  ) : (
                    <>
                      <span className="font-mono font-bold text-sm text-gray-900 w-24 shrink-0">{it.codigo}</span>
                      <span className="flex-1 text-sm text-gray-600 truncate">
                        {it.descripcion ?? <span className="italic text-gray-400">No está en el catálogo</span>}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {it.talla ? `T${it.talla}` : ''}{it.talla && it.cantidad > 1 ? ' · ' : ''}{it.cantidad > 1 ? `×${it.cantidad}` : ''}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">Artículo</span>
                    </>
                  )}
                  <button onClick={() => quitar(i)} className="text-gray-300 hover:text-red-500 shrink-0" title="Quitar">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={guardar}
          disabled={guardando || items.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl py-3.5 transition-colors shadow-md shadow-blue-200 disabled:opacity-50"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Guardar envío ({items.length} ítem{items.length !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  )
}
