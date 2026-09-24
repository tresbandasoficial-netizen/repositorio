'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Loader2 } from 'lucide-react'
import { buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { generarLinkNuevoAction, ItemLinkNuevo } from '@/app/actions/shopify'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { formatCOP, formatMiles } from '@/lib/utils/format'
import { tallasDeCategoria } from '@/types'
import { LinkNuevoAcciones } from '@/components/pedidos/LinkNuevoAcciones'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'

// Formulario del "Link para cliente nuevo": solo productos del catálogo (el
// buscador por código es el mismo de crear pedido), talla, cantidad, precio y
// foto. Sin cliente: el cliente se crea solo cuando confirma en Shopify.

type Fila = {
  key: number
  query: string
  opciones: ArticuloBusqueda[]
  abierto: boolean
  buscado: boolean
  articulo: ArticuloBusqueda | null
  talla: string
  cantidad: number
  precio: number
  foto: string | null
}

let filaSeq = 1
function filaVacia(): Fila {
  return { key: filaSeq++, query: '', opciones: [], abierto: false, buscado: false, articulo: null, talla: '', cantidad: 1, precio: 0, foto: null }
}

export function LinkNuevoForm({ sedes, sedeDefault, esAdmin, esAsesor }: {
  sedes: Array<{ id: string; codigo: string; nombre: string }>
  sedeDefault: string
  esAdmin: boolean
  esAsesor: boolean
}) {
  const router = useRouter()
  const [sedeId, setSedeId] = useState(sedeDefault)
  const [notas, setNotas] = useState('')
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ url: string; draftName: string | null; total: number } | null>(null)
  const [pending, start] = useTransition()
  const timers = useRef<Record<number, ReturnType<typeof setTimeout> | undefined>>({})

  function patch(key: number, cambios: Partial<Fila>) {
    setFilas(prev => prev.map(f => f.key === key ? { ...f, ...cambios } : f))
  }

  function cambiarCodigo(key: number, val: string) {
    const q = val.toUpperCase()
    patch(key, { query: q, articulo: null, buscado: false, talla: '', abierto: false })
    const t = timers.current[key]
    if (t) clearTimeout(t)
    if (q.trim().length < 2) { patch(key, { opciones: [] }); return }
    timers.current[key] = setTimeout(async () => {
      const arts = await buscarArticulosAction(q.trim(), sedeId || null)
      // Respuesta obsoleta (el texto cambió o ya se eligió un artículo): se
      // ignora, para no reabrir la lista encima de la fila y cambiar el
      // producto con el siguiente clic.
      setFilas(prev => prev.map(f => (f.key === key && f.query === q && !f.articulo)
        ? { ...f, opciones: arts, abierto: arts.length > 0, buscado: true }
        : f))
    }, 250)
  }

  function elegir(key: number, a: ArticuloBusqueda) {
    // Precio y foto: los de la ficha si los tiene (ambos se pueden cambiar).
    // La talla la escoge la persona.
    patch(key, { articulo: a, query: a.codigo ?? '', abierto: false, opciones: [], precio: a.precio_venta ?? 0, foto: a.foto ?? null })
  }

  const total = filas.reduce((s, f) => s + (f.articulo ? f.precio * f.cantidad : 0), 0)

  function generar() {
    if (pending) return
    setError(null)
    setResultado(null)
    const items: ItemLinkNuevo[] = []
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      if (!f.articulo) { setError(`El producto ${i + 1} no está enlazado al catálogo: escribe el código y selecciónalo de la lista.`); return }
      if (!f.articulo.codigo) { setError(`"${f.articulo.nombre}" no tiene código en el catálogo; ponle el código en Inventario.`); return }
      const necesitaTalla = tallasDeCategoria(f.articulo.categoria as any, f.articulo.sexo as any).length > 0
      if (necesitaTalla && !f.talla) { setError(`El producto ${i + 1} necesita talla.`); return }
      if (!(f.precio > 0)) { setError(`El producto ${i + 1} no tiene precio de venta.`); return }
      if (esAsesor && !f.foto) { setError(`El producto ${i + 1} no tiene foto. Carga la imagen del producto antes de generar el link.`); return }
      items.push({
        articulo_id: f.articulo.id,
        marca: f.articulo.marca,
        descripcion: f.articulo.nombre,
        talla: f.talla || null,
        cantidad: f.cantidad,
        precio_venta: f.precio,
        imagen_url: f.foto,
        color: f.articulo.color ?? null,
        sexo: f.articulo.sexo ?? null,
        categoria: f.articulo.categoria ?? null,
      })
    }
    start(async () => {
      const r = await generarLinkNuevoAction({ sedeId, notas: notas.trim() || null, items })
      if (!r.ok) { setError(r.error); return }
      setResultado({ url: r.url, draftName: r.draftName, total })
      setFilas([filaVacia()])
      setNotas('')
      router.refresh()
    })
  }

  const inputCls = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="space-y-4">
      {resultado && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-violet-800">
            🔗 Link listo {resultado.draftName ? `(${resultado.draftName})` : ''} · {formatCOP(resultado.total)} — mándaselo al cliente
          </p>
          <code className="block text-[11px] text-violet-700 break-all">{resultado.url}</code>
          <LinkNuevoAcciones url={resultado.url} />
          <p className="text-[11px] text-violet-600">Cuando el cliente confirme, el pedido aparece en la lista de abajo y en Pedidos.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Productos</p>
          <button type="button" onClick={() => setFilas(prev => [...prev, filaVacia()])}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            + Agregar producto
          </button>
        </div>

        {filas.map((f, i) => (
          <div key={f.key} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={f.query}
                  onChange={e => cambiarCodigo(f.key, e.target.value)}
                  onBlur={() => setTimeout(() => patch(f.key, { abierto: false }), 150)}
                  placeholder="Código"
                  className={`w-full font-mono ${inputCls}`}
                />
                {f.abierto && f.opciones.length > 0 && (
                  <div className="absolute z-10 left-0 mt-1 min-w-[24rem] max-w-[min(32rem,90vw)] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                    {f.opciones.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onMouseDown={() => elegir(f.key, opt)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0 flex items-start gap-2.5"
                      >
                        {opt.foto && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opt.foto} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 object-cover mt-0.5" />
                        )}
                        <span className="min-w-0 flex-1">
                          {opt.codigo ? (
                            <span className="block font-mono text-[11px] font-semibold text-blue-700 truncate">{opt.codigo}</span>
                          ) : (
                            <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">⚠ SIN CÓDIGO — no sirve para pedidos</span>
                          )}
                          <span className="block font-medium text-gray-900 truncate">
                            {opt.marca && <span className="text-gray-500">{opt.marca} </span>}{opt.nombre}
                          </span>
                          <span className="block text-xs mt-0.5">
                            {opt.tallaStock.filter(t => t.stock > 0).length > 0 ? (
                              <>
                                <span className="text-gray-400">En stock: </span>
                                {opt.tallaStock.filter(t => t.stock > 0).map(t => (
                                  <span key={t.talla ?? ''} className="text-emerald-700 font-medium mr-1.5">{t.talla ? `T${t.talla}` : 'sin talla'}·{t.stock}</span>
                                ))}
                              </>
                            ) : <span className="text-gray-400">Sin existencias</span>}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                {f.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.foto} alt="" className="h-9 w-9 shrink-0 rounded-md bg-gray-100 object-cover" />
                )}
                <p className={`text-sm truncate ${f.articulo ? 'text-gray-900' : 'text-gray-400'}`}>
                  {f.articulo ? `${f.articulo.marca} ${f.articulo.nombre}${f.articulo.color ? ` · ${f.articulo.color}` : ''}` : 'Escribe el código y elige el producto'}
                </p>
              </div>
            </div>

            {f.buscado && f.opciones.length === 0 && !f.articulo && f.query.trim().length >= 2 && (
              <p className="text-xs text-amber-700">No está en el catálogo. Créalo primero en Inventario (o en un pedido normal) y vuelve.</p>
            )}
            {f.articulo && <p className="text-xs text-green-600 font-medium">✓ Enlazado al catálogo</p>}

            <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center">
              <TallaSelect
                categoria={(f.articulo?.categoria as any) ?? ''}
                sexo={(f.articulo?.sexo as any) ?? ''}
                value={f.talla}
                onChange={talla => patch(f.key, { talla })}
                className={inputCls}
                stockPorTalla={f.articulo ? Object.fromEntries(f.articulo.tallaStock.filter(t => t.talla).map(t => [String(t.talla).trim().toUpperCase(), t.stock])) : undefined}
              />
              <input
                type="number"
                min={1}
                max={99}
                value={f.cantidad}
                onChange={e => patch(f.key, { cantidad: Math.min(99, Math.max(1, parseInt(e.target.value) || 1)) })}
                className={`w-16 text-center ${inputCls}`}
                title="Cantidad"
              />
              <input
                type="text"
                inputMode="numeric"
                value={formatMiles(f.precio || '')}
                onChange={e => patch(f.key, { precio: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
                placeholder="Precio de venta"
                className={inputCls}
              />
              <ImagenProducto value={f.foto} onChange={url => patch(f.key, { foto: url })} />
              {filas.length > 1
                ? <button type="button" onClick={() => setFilas(prev => prev.filter(x => x.key !== f.key))} className="text-red-400 hover:text-red-600 px-1" title="Quitar">✕</button>
                : <div className="w-6" />}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {esAdmin && sedes.length > 1 ? (
            <label className="text-xs text-gray-500 flex items-center gap-2">
              Sede del pedido:
              <select value={sedeId} onChange={e => setSedeId(e.target.value)} className={`${inputCls} text-xs`}>
                {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
              </select>
            </label>
          ) : (
            <p className="text-xs text-gray-400">Sede: {sedes.find(s => s.id === sedeId)?.nombre ?? '—'}</p>
          )}
          <input
            type="text"
            value={notas}
            onChange={e => setNotas(e.target.value.slice(0, 500))}
            placeholder="Nota para el pedido (opcional)"
            className={`flex-1 min-w-[12rem] ${inputCls}`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">Total del link: <span className="font-bold text-gray-900">{formatCOP(total)}</span></p>
          <button
            type="button"
            onClick={generar}
            disabled={pending || !sedeId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Generar link
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
