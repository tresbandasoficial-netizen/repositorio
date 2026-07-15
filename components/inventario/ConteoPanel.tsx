'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarArticulosAction } from '@/app/actions/articulos'
import { registrarConteoAction, ItemConteo } from '@/app/actions/conteo'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { CrearArticuloModal, ArticuloCreado } from './CrearArticuloModal'
import { Loader2, Search, Plus, Trash2, ClipboardCheck, Check } from 'lucide-react'

type Sede = { id: string; codigo: string; nombre: string }

type ArtSel = {
  articulo_id: string
  codigo: string | null
  descripcion: string
  categoria: string | null
}

type Fila = {
  articulo_id: string
  codigo: string | null
  descripcion: string
  talla: string | null
  cantidad: number
}

// Conteo físico: se cuenta la mercancía de la sede y el stock queda fijado
// exactamente en lo contado (el servidor calcula el ajuste necesario).
export function ConteoPanel({ sedes, sedeFijaId }: { sedes: Sede[]; sedeFijaId: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [sedeId, setSedeId] = useState(sedeFijaId ?? sedes[0]?.id ?? '')
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<{ items: number; ajustes: number } | null>(null)

  // Buscador del catálogo
  const [busqueda, setBusqueda] = useState('')
  const [opciones, setOpciones] = useState<ArtSel[]>([])
  const [buscando, setBuscando] = useState(false)
  const [open, setOpen] = useState(false)
  const [artSel, setArtSel] = useState<ArtSel | null>(null)
  const [crear, setCrear] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [talla, setTalla] = useState('')
  const [cantidad, setCantidad] = useState('')
  const cantRef = useRef<HTMLInputElement>(null)

  function onBusquedaChange(valor: string) {
    setBusqueda(valor)
    setArtSel(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = valor.trim()
    if (q.length < 2) { setOpciones([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const arts = await buscarArticulosAction(q, null)
        const qUp = q.toUpperCase()
        // El código de producto manda: exacto primero, luego los que empiezan
        // por lo digitado, luego los que lo contienen, y al final el resto.
        const prioridad = (codigo: string | null) => {
          const c = (codigo ?? '').toUpperCase()
          if (!c) return 3
          if (c === qUp) return 0
          if (c.startsWith(qUp)) return 1
          if (c.includes(qUp)) return 2
          return 3
        }
        const opts = arts
          .map(a => ({
            articulo_id: a.id,
            codigo: a.codigo,
            descripcion: `${a.marca} ${a.nombre}${a.color ? ` ${a.color}` : ''}`.trim(),
            categoria: a.categoria,
          }))
          .sort((a, b) => prioridad(a.codigo) - prioridad(b.codigo))

        // Código exacto (escaneado o digitado completo): se selecciona solo.
        const exacto = opts.find(o => (o.codigo ?? '').toUpperCase() === qUp)
        if (exacto) {
          elegir(exacto)
          setOpciones([])
        } else {
          setOpciones(opts)
          setOpen(true)
        }
        setError(null)
      } catch (e) {
        // Típico tras un despliegue con la página abierta: la acción vieja ya
        // no existe en el servidor. Recargar la página lo resuelve.
        console.error('Error buscando artículos:', e)
        setError('No se pudo buscar. Recarga la página (Ctrl+Shift+R) e intenta de nuevo.')
      } finally {
        setBuscando(false)
      }
    }, 350)
  }

  function elegir(a: ArtSel) {
    setArtSel(a)
    setBusqueda(`${a.codigo ? `${a.codigo} · ` : ''}${a.descripcion}`)
    setOpen(false)
  }

  function articuloCreado(art: ArticuloCreado) {
    setCrear(false)
    elegir({
      articulo_id: art.id,
      codigo: art.codigo,
      descripcion: `${art.marca} ${art.nombre}${art.color ? ` ${art.color}` : ''}`.trim(),
      categoria: art.categoria,
    })
  }

  function agregar() {
    setError(null)
    if (!artSel) { setError('Busca y selecciona un artículo del catálogo'); return }
    const cant = parseInt(cantidad, 10)
    if (isNaN(cant) || cant < 0) { setError('Escribe la cantidad contada (puede ser 0 si no queda ninguno)'); return }
    const esAccesorio = artSel.categoria === 'accesorios'
    if (!esAccesorio && !talla.trim()) { setError('Indica la talla'); return }

    const t = talla.trim() || null
    setFilas(prev => {
      const idx = prev.findIndex(f => f.articulo_id === artSel.articulo_id && f.talla === t)
      if (idx !== -1) {
        // Mismo artículo+talla contado otra vez: se suma (encontraron más unidades)
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cant }
        return next
      }
      return [...prev, { articulo_id: artSel.articulo_id, codigo: artSel.codigo, descripcion: artSel.descripcion, talla: t, cantidad: cant }]
    })
    // Mantener el artículo elegido para contar otra talla del mismo modelo
    setTalla('')
    setCantidad('')
  }

  function quitar(idx: number) {
    setFilas(prev => prev.filter((_, i) => i !== idx))
  }

  function guardar() {
    if (filas.length === 0) { setError('No has agregado nada al conteo'); return }
    if (!window.confirm(`¿Guardar el conteo? El stock de ${filas.length} artículo(s)/talla(s) quedará fijado en lo contado.`)) return
    startTransition(async () => {
      setError(null)
      try {
        const items: ItemConteo[] = filas.map(f => ({ articulo_id: f.articulo_id, talla: f.talla, cantidad: f.cantidad }))
        const r = await registrarConteoAction(sedeId, items)
        if (!r.ok) { setError(r.error); return }
        setExito({ items: filas.length, ajustes: r.ajustes })
        setFilas([])
        router.refresh()
      } catch (e) {
        console.error('Error guardando conteo:', e)
        setError('Hubo una actualización del sistema. Recarga la página (F5) y vuelve a intentar — lo contado se pierde al recargar, así que guarda en tandas pequeñas.')
      }
    })
  }

  const sedeNombre = sedes.find(s => s.id === sedeId)?.nombre ?? ''
  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0)

  if (exito) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check size={26} className="text-green-600" />
        </div>
        <p className="text-lg font-bold text-gray-900">Conteo guardado</p>
        <p className="text-sm text-gray-500">
          {exito.items} artículo(s)/talla(s) contados en {sedeNombre} · {exito.ajustes} ajuste(s) aplicados al stock
        </p>
        <button
          onClick={() => setExito(null)}
          className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Contar más artículos
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sede */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sede que se está contando:</p>
        {sedeFijaId ? (
          <span className="text-sm font-bold text-gray-900">{sedeNombre}</span>
        ) : (
          <select
            value={sedeId}
            onChange={e => { setSedeId(e.target.value); setFilas([]) }}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
          </select>
        )}
        <p className="text-xs text-gray-400 w-full">
          El stock de cada artículo contado quedará fijado EXACTAMENTE en la cantidad que escribas (lo demás no se toca).
        </p>
      </div>

      {/* Captura */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusquedaChange(e.target.value)}
            onFocus={() => { if (opciones.length > 0 && !artSel) setOpen(true) }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              // Con lector: el código exacto ya se seleccionó solo; Enter pasa a cantidad.
              if (artSel) { cantRef.current?.focus(); return }
              if (opciones.length === 1) { elegir(opciones[0]); cantRef.current?.focus() }
            }}
            placeholder="Código de producto (o marca/nombre)…"
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${artSel ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}
          />
          {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}

          {open && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto">
              {opciones.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-gray-400">Sin resultados en el catálogo</p>
              ) : opciones.map((a) => (
                <button
                  key={a.articulo_id}
                  onClick={() => elegir(a)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                >
                  {a.codigo && <span className="font-mono font-bold text-gray-900 shrink-0">{a.codigo}</span>}
                  <span className="text-gray-600 truncate">{a.descripcion}</span>
                </button>
              ))}
              <button
                onClick={() => { setCrear(true); setOpen(false) }}
                className="w-full text-left px-3 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50/60 hover:bg-emerald-50 transition-colors border-t border-gray-100"
              >
                ➕ Crear artículo nuevo{busqueda.trim() ? ` "${busqueda.trim().toUpperCase()}"` : ''}
              </button>
            </div>
          )}

          {crear && (
            <CrearArticuloModal
              codigoInicial={busqueda.trim()}
              onCreado={articuloCreado}
              onClose={() => setCrear(false)}
            />
          )}
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <TallaSelect
            categoria={(artSel?.categoria ?? '') as any}
            value={talla}
            onChange={setTalla}
            className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            ref={cantRef}
            type="number"
            min={0}
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
            placeholder="Cantidad contada"
            className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-center bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={agregar}
            disabled={isPending || !artSel}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Plus size={15} /> Agregar
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Tip: elige el artículo una vez y ve agregando talla por talla. Si cuentas el mismo artículo+talla dos veces, las cantidades se suman.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Lista contada */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">Artículos contados</p>
          <p className="text-xs text-gray-400">{filas.length} referencia(s) · {totalUnidades} unidades</p>
        </div>
        {filas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            Busca un artículo, escribe talla y cantidad, y presiona Agregar
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {filas.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-6 text-xs text-gray-300 font-medium text-right shrink-0">{i + 1}</span>
                {f.codigo && <span className="font-mono font-bold text-sm text-gray-900 shrink-0">{f.codigo}</span>}
                <span className="flex-1 text-sm text-gray-600 truncate">{f.descripcion}</span>
                <span className="text-xs text-gray-500 shrink-0">{f.talla ? `T${f.talla}` : 'Sin talla'}</span>
                <span className="text-sm font-bold text-gray-900 w-10 text-right shrink-0">{f.cantidad}</span>
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
        disabled={isPending || filas.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl py-3.5 transition-colors shadow-md shadow-emerald-200 disabled:opacity-50"
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
        Guardar conteo ({filas.length})
      </button>
    </div>
  )
}
