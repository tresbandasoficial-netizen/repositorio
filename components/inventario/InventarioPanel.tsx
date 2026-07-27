'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  crearArticuloAction, registrarEntradaAction, transferirStockAction,
} from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { useAviso } from '@/components/ui/Aviso'
import { StockAgrupado } from '@/lib/queries/inventario'
import { Articulo, CategoriaArticulo, SexoArticulo } from '@/types'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { formatMiles } from '@/lib/utils/format'
import { CrearArticuloModal, ArticuloCreado } from './CrearArticuloModal'
import { EditarArticuloModal } from './EditarArticuloModal'

type Sede = { id: string; codigo: string; nombre: string }

// Rótulos para no mostrar los valores crudos de la base en la tabla.
const CATEGORIA_LABEL: Record<string, string> = {
  ropa: 'Ropa', tenis: 'Tenis', accesorios: 'Accesorios',
}
const SEXO_LABEL: Record<string, string> = {
  hombre: 'Hombre', mujer: 'Mujer', nino: 'Niño',
}

export function InventarioPanel({
  filas, columnasSedes, sedes, articulos,
}: {
  filas: StockAgrupado[]
  columnasSedes: string[]
  sedes: Sede[]
  articulos: Articulo[]
}) {
  const [accion, setAccion] = useState<'none' | 'articulo' | 'entrada' | 'transferencia'>('none')
  const [q, setQ] = useState('')
  const [sedeFiltro, setSedeFiltro] = useState<string | null>(null)   // null = todas
  const [editando, setEditando] = useState<Articulo | null>(null)
  // Artículos creados en esta sesión desde el buscador (antes de que llegue el refresh)
  const [extras, setExtras] = useState<Articulo[]>([])
  const todos = [
    ...articulos,
    ...extras.filter(e => !articulos.some(a => a.id === e.id)),
  ]
  function registrarCreado(art: ArticuloCreado) {
    setExtras(prev => [...prev, { ...art, activo: true } as unknown as Articulo])
  }

  // El stock no trae el código ni el color: se leen del catálogo por articulo_id.
  const porId = new Map(todos.map(a => [a.id, a]))

  // Unidades y referencias por sede, para los botones de filtro.
  const resumenSede = new Map<string, { unidades: number; refs: number }>()
  for (const cod of columnasSedes) resumenSede.set(cod, { unidades: 0, refs: 0 })
  for (const f of filas) {
    for (const cod of columnasSedes) {
      const v = f.porSede[cod] ?? 0
      if (v === 0) continue
      const r = resumenSede.get(cod)!
      r.unidades += v
      r.refs += 1
    }
  }

  const texto = q.trim().toLowerCase()
  const filtradas = filas.filter(f => {
    // Filtro por sede: se muestran las filas con movimiento en esa sede. El 0 se
    // esconde, pero el NEGATIVO no — es justo lo que hay que ver ahí.
    if (sedeFiltro && (f.porSede[sedeFiltro] ?? 0) === 0) return false
    if (!texto) return true
    const a = porId.get(f.articulo_id)
    return `${a?.codigo ?? ''} ${f.marca} ${f.nombre} ${a?.color ?? ''} ${a?.referencia ?? ''} ${f.talla ?? ''}`
      .toLowerCase().includes(texto)
  })

  // Al filtrar por sede, esa columna se muestra primero para poder leerla de
  // corrido; las demás quedan como referencia para decidir traslados.
  const columnasVista = sedeFiltro
    ? [sedeFiltro, ...columnasSedes.filter(c => c !== sedeFiltro)]
    : columnasSedes

  // La tabla de arriba sale del stock: un artículo sin movimientos no aparece.
  // Al buscar se listan aparte los que coinciden pero no tienen stock, para
  // poder abrir su ficha igual.
  const conStock = new Set(filas.map(f => f.articulo_id))
  const sinStock = texto
    ? todos.filter(a =>
        !conStock.has(a.id) &&
        `${a.codigo ?? ''} ${a.marca} ${a.nombre} ${a.color ?? ''} ${a.referencia ?? ''}`
          .toLowerCase().includes(texto)
      )
    : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAccion('articulo')} variant="secondary">+ Nuevo artículo</Button>
        <Button onClick={() => setAccion('entrada')} variant="secondary">+ Entrada de stock</Button>
        <Button onClick={() => setAccion('transferencia')} variant="secondary">⇄ Transferir</Button>
        <a
          href="/inventario/conteo"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
        >
          📋 Conteo físico
        </a>
      </div>

      {accion === 'articulo'      && <CrearArticulo onClose={() => setAccion('none')} />}
      {accion === 'entrada'       && <Entrada articulos={todos} sedes={sedes} onCreado={registrarCreado} onClose={() => setAccion('none')} />}
      {accion === 'transferencia' && <Transferencia articulos={todos} sedes={sedes} onCreado={registrarCreado} onClose={() => setAccion('none')} />}

      {/* Filtro por sede */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSedeFiltro(null)}
          aria-pressed={sedeFiltro === null}
          className={`rounded-xl border px-3.5 py-2 text-left transition-colors ${
            sedeFiltro === null
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <span className="block text-xs font-semibold uppercase tracking-wide">Todas</span>
          <span className={`block text-sm font-bold tabular-nums ${sedeFiltro === null ? 'text-white' : 'text-gray-900'}`}>
            {filas.length} <span className="font-normal opacity-70">refs</span>
          </span>
        </button>

        {columnasSedes.map(cod => {
          const r = resumenSede.get(cod) ?? { unidades: 0, refs: 0 }
          const activo = sedeFiltro === cod
          const nombre = cod === 'CENTRAL'
            ? 'Central'
            : sedes.find(s => s.codigo === cod)?.nombre ?? cod
          return (
            <button
              key={cod}
              type="button"
              onClick={() => setSedeFiltro(activo ? null : cod)}
              aria-pressed={activo}
              title={`${r.refs} referencias · ${r.unidades} unidades en ${nombre}`}
              className={`rounded-xl border px-3.5 py-2 text-left transition-colors ${
                activo
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="block text-xs font-semibold uppercase tracking-wide">{nombre}</span>
              <span className={`block text-sm font-bold tabular-nums ${activo ? 'text-white' : 'text-gray-900'}`}>
                {r.refs} <span className="font-normal opacity-70">refs · {r.unidades} u</span>
              </span>
            </button>
          )
        })}
      </div>

      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por código, marca, nombre, color o talla…"
        className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {sedeFiltro && (
        <p className="text-xs text-gray-500">
          Mostrando solo lo que tiene movimiento en{' '}
          <strong className="text-gray-700">
            {sedeFiltro === 'CENTRAL' ? 'Central' : sedes.find(s => s.codigo === sedeFiltro)?.nombre ?? sedeFiltro}
          </strong>
          . Las demás sedes siguen visibles como referencia para decidir traslados.
        </p>
      )}

      {editando && <EditarArticuloModal articulo={editando} onClose={() => setEditando(null)} />}

      {filtradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {filas.length === 0
            ? 'Aún no hay artículos con stock. Crea un artículo y registra una entrada.'
            : sinStock.length > 0
              ? 'Ninguno con stock coincide — mira los del catálogo abajo.'
              : sedeFiltro
                ? `Sin existencias en ${sedeFiltro === 'CENTRAL' ? 'Central' : sedes.find(s => s.codigo === sedeFiltro)?.nombre ?? sedeFiltro}${texto ? ' para esa búsqueda' : ''}.`
                : 'Sin resultados'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Código</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Marca</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Talla</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoría</th>
                {columnasVista.map(s => (
                  <th
                    key={s}
                    className={`text-center px-4 py-3 text-xs font-medium uppercase ${
                      s === sedeFiltro ? 'text-blue-700 bg-blue-50' : 'text-gray-500'
                    }`}
                  >
                    {s}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(f => {
                const art = porId.get(f.articulo_id)
                return (
                <tr key={f.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                    {art?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {f.marca || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{f.nombre}</p>
                    {art?.color && <p className="text-xs text-gray-400">{art.color}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-sm whitespace-nowrap">
                    {f.talla ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {f.categoria
                      ? <span className="text-xs text-gray-600">{CATEGORIA_LABEL[f.categoria] ?? f.categoria}</span>
                      : <span className="text-xs text-gray-300">Sin categoría</span>}
                    {art?.sexo && <p className="text-[11px] text-gray-400">{SEXO_LABEL[art.sexo] ?? art.sexo}</p>}
                  </td>
                  {columnasVista.map(s => {
                    const v = f.porSede[s] ?? 0
                    const esFiltrada = s === sedeFiltro
                    return (
                      <td key={s} className={`px-4 py-3 text-center tabular-nums ${esFiltrada ? 'bg-blue-50/60' : ''}`}>
                        <span className={
                          v < 0 ? 'text-red-600 font-semibold'
                          : v === 0 ? 'text-gray-300'
                          : esFiltrada ? 'text-gray-900 font-semibold'
                          : 'text-gray-700'
                        }>
                          {v}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-center font-semibold text-gray-900">{f.total}</td>
                  <td className="px-4 py-3 text-right">
                    {art && (
                      <button
                        type="button"
                        onClick={() => setEditando(art)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        title="Editar la ficha del artículo"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {sinStock.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-2.5">
            <p className="text-xs font-medium text-gray-500 uppercase">
              En catálogo, sin stock ({sinStock.length})
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {sinStock.slice(0, 30).map(a => (
              <div key={a.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                <span className="font-mono text-xs text-gray-500 w-32 shrink-0">{a.codigo ?? '—'}</span>
                <span className="w-24 shrink-0 text-sm text-gray-700 truncate">{a.marca || '—'}</span>
                <span className="flex-1 text-sm text-gray-900 truncate">
                  {a.nombre}
                  {a.color && <span className="text-gray-400"> · {a.color}</span>}
                </span>
                <span className="w-24 shrink-0 text-xs text-gray-500 truncate">
                  {a.categoria ? CATEGORIA_LABEL[a.categoria] ?? a.categoria : 'Sin categoría'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditando(a)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline shrink-0"
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
          {sinStock.length > 30 && (
            <p className="px-6 py-2 text-xs text-gray-400 border-t border-gray-100">
              Se muestran 30 de {sinStock.length} — afina la búsqueda.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function CrearArticulo({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [referencia, setReferencia] = useState('')
  const [color, setColor] = useState('')
  const [sexo, setSexo] = useState<SexoArticulo | ''>('')
  const [categoria, setCategoria] = useState<CategoriaArticulo | ''>('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!marca.trim() || !nombre.trim()) { setError('Marca y nombre son obligatorios'); return }
    if (!categoria) { setError('Indica si es ropa, tenis o accesorio'); return }
    if (categoria !== 'accesorios' && !sexo) { setError('Indica si es de hombre, de mujer o de niño'); return }
    setError('')
    start(async () => {
      const r = await crearArticuloAction({ codigo, nombre, marca, referencia, color, sexo, categoria, descripcion: '' })
      if (!r.ok) { setError(r.error); avisarError(r.error); return }
      avisar('Artículo creado')
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Nuevo artículo de catálogo" onClose={onClose}>
      <p className="text-xs text-gray-400 mb-3">
        El código SKU identifica el modelo (ej. "VOMERO5-WB"). La talla se registra al hacer la entrada de stock.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className={inputCls} placeholder="Código SKU (ej. VOMERO5-WB)" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} />
        <input className={inputCls} placeholder="Marca (ej. Nike)" value={marca} onChange={e => setMarca(e.target.value)} />
        <input className={inputCls} placeholder="Nombre / modelo" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input className={inputCls} placeholder="Referencia técnica (opcional)" value={referencia} onChange={e => setReferencia(e.target.value)} />
        <input className={inputCls} placeholder="Color (ej. White/Black)" value={color} onChange={e => setColor(e.target.value)} />
        <select className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value as CategoriaArticulo | '')}>
          <option value="">Categoría… *</option>
          <option value="ropa">Ropa</option>
          <option value="tenis">Tenis</option>
          <option value="accesorios">Accesorios</option>
        </select>
        <select className={inputCls} value={sexo} onChange={e => setSexo(e.target.value as SexoArticulo | '')} disabled={categoria === 'accesorios'}>
          <option value="">{categoria === 'accesorios' ? 'Sexo (no aplica)' : 'Hombre / Mujer… *'}</option>
          <option value="hombre">Hombre</option>
          <option value="mujer">Mujer</option>
          <option value="nino">Niño</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3"><Button onClick={submit} disabled={pending}>{pending ? 'Guardando…' : 'Crear artículo'}</Button></div>
    </Panel>
  )
}

// Buscador de artículo con texto libre (código, marca, nombre o color).
// Filtra sobre el catálogo ya cargado — sin ir al servidor. Si el artículo
// no existe, permite crearlo ahí mismo y queda seleccionado.
function SelectArticulo({ articulos, value, onChange, onCreado }: {
  articulos: Articulo[]
  value: string
  onChange: (v: string) => void
  onCreado?: (art: ArticuloCreado) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [crear, setCrear] = useState(false)

  const sel = articulos.find(a => a.id === value) ?? null
  const etiqueta = (a: Articulo) =>
    `${a.codigo ? `${a.codigo} · ` : ''}${a.marca} ${a.nombre}${a.color ? ` · ${a.color}` : ''}`

  const texto = q.trim().toLowerCase()
  // El código de producto manda: exacto primero, luego prefijo, luego contiene.
  const prioridad = (a: Articulo) => {
    const c = (a.codigo ?? '').toLowerCase()
    if (!c) return 3
    if (c === texto) return 0
    if (c.startsWith(texto)) return 1
    if (c.includes(texto)) return 2
    return 3
  }
  const resultados = texto.length < 1 ? [] : articulos
    .filter(a =>
      `${a.codigo ?? ''} ${a.marca} ${a.nombre} ${a.color ?? ''} ${(a as any).referencia ?? ''}`
        .toLowerCase().includes(texto)
    )
    .sort((a, b) => prioridad(a) - prioridad(b))
    .slice(0, 15)

  function creado(art: ArticuloCreado) {
    onCreado?.(art)
    onChange(art.id)
    setQ('')
    setCrear(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={sel ? etiqueta(sel) : q}
        onChange={e => {
          const v = e.target.value
          // Código exacto (escaneado o digitado completo): se selecciona solo.
          const exacto = articulos.find(a => (a.codigo ?? '').toUpperCase() === v.trim().toUpperCase() && v.trim() !== '')
          if (exacto) { onChange(exacto.id); setQ(''); setOpen(false); return }
          onChange(''); setQ(v); setOpen(true)
        }}
        onFocus={() => { if (!sel && resultados.length > 0) setOpen(true) }}
        placeholder="Código de producto (o marca/nombre)…"
        className={`${inputCls} ${sel ? 'border-green-300 bg-green-50/50' : ''}`}
      />
      {open && !sel && texto.length >= 1 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-60 overflow-y-auto">
          {resultados.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onChange(a.id); setQ(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
            >
              {a.codigo && <span className="font-mono font-bold text-gray-900 shrink-0">{a.codigo}</span>}
              <span className="text-gray-600 truncate">{a.marca} {a.nombre}{a.color ? ` · ${a.color}` : ''}</span>
            </button>
          ))}
          {resultados.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Sin resultados en el catálogo</p>
          )}
          {onCreado && (
            <button
              type="button"
              onClick={() => { setCrear(true); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50/60 hover:bg-emerald-50 transition-colors border-t border-gray-100"
            >
              ➕ Crear artículo nuevo{q.trim() ? ` "${q.trim().toUpperCase()}"` : ''}
            </button>
          )}
        </div>
      )}
      {crear && (
        <CrearArticuloModal
          codigoInicial={q.trim()}
          onCreado={creado}
          onClose={() => setCrear(false)}
        />
      )}
    </div>
  )
}

function Entrada({ articulos, sedes, onCreado, onClose }: { articulos: Articulo[]; sedes: Sede[]; onCreado?: (a: ArticuloCreado) => void; onClose: () => void }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const tr = sedes.find(s => s.codigo === 'TR')
  const [articuloId, setArticuloId] = useState('')
  const [talla, setTalla] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [sedeId, setSedeId] = useState<string>(tr?.id ?? '')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    const c = parseInt(cantidad.replace(/\D/g, ''), 10)
    const co = parseInt(costo.replace(/\D/g, ''), 10)
    if (!articuloId) { setError('Selecciona un artículo'); return }
    const esAccesorio = articulos.find(a => a.id === articuloId)?.categoria === 'accesorios'
    if (!esAccesorio && !talla.trim()) { setError('La talla es obligatoria'); return }
    if (!c || c <= 0) { setError('Cantidad inválida'); return }
    if (isNaN(co) || co < 0) { setError('Costo inválido'); return }
    setError('')
    start(async () => {
      const r = await registrarEntradaAction({
        articulo_id: articuloId, talla: talla.trim(), cantidad: c,
        costo_unitario_cop: co, sede_id: sedeId || null, notas,
      })
      if (!r.ok) { setError(r.error); avisarError(r.error); return }
      avisar('Entrada registrada')
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Entrada de stock" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SelectArticulo articulos={articulos} value={articuloId} onChange={setArticuloId} onCreado={onCreado} />
        <TallaSelect
          categoria={articulos.find(a => a.id === articuloId)?.categoria ?? ''}
          sexo={articulos.find(a => a.id === articuloId)?.sexo ?? ''}
          value={talla}
          onChange={setTalla}
          className={inputCls}
        />
        <select className={inputCls} value={sedeId} onChange={e => setSedeId(e.target.value)}>
          {sedes.map(s => (
            <option key={s.id} value={s.id}>{s.nombre}{s.codigo === 'TR' ? ' (centro de distribución)' : ''}</option>
          ))}
        </select>
        <input className={inputCls} inputMode="numeric" placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        <input className={inputCls} inputMode="numeric" placeholder="Costo unitario (COP)" value={formatMiles(costo)} onChange={e => setCosto(e.target.value.replace(/\D/g, ''))} />
        <input className={`${inputCls} sm:col-span-2`} placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
      </div>
      <p className="text-xs text-gray-400 mt-2">El costo alimenta el promedio ponderado (CPP) por talla.</p>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3"><Button onClick={submit} disabled={pending}>{pending ? 'Registrando…' : 'Registrar entrada'}</Button></div>
    </Panel>
  )
}

function Transferencia({ articulos, sedes, onCreado, onClose }: { articulos: Articulo[]; sedes: Sede[]; onCreado?: (a: ArticuloCreado) => void; onClose: () => void }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const tr = sedes.find(s => s.codigo === 'TR')
  const [articuloId, setArticuloId] = useState('')
  const [talla, setTalla] = useState('')
  const [origen, setOrigen] = useState<string>(tr?.id ?? '')
  const [destino, setDestino] = useState<string>('')
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    const c = parseInt(cantidad.replace(/\D/g, ''), 10)
    if (!articuloId) { setError('Selecciona un artículo'); return }
    const esAccesorio = articulos.find(a => a.id === articuloId)?.categoria === 'accesorios'
    if (!esAccesorio && !talla.trim()) { setError('La talla es obligatoria'); return }
    if (!origen || !destino) { setError('Selecciona sede de origen y destino'); return }
    if (origen === destino) { setError('El origen y el destino no pueden ser iguales'); return }
    if (!c || c <= 0) { setError('Cantidad inválida'); return }
    setError('')
    start(async () => {
      const r = await transferirStockAction({
        articulo_id: articuloId, talla: talla.trim(),
        sede_origen: origen, sede_destino: destino, cantidad: c, notas,
      })
      if (!r.ok) { setError(r.error); avisarError(r.error); return }
      avisar('Transferencia realizada')
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Transferir stock entre sedes" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SelectArticulo articulos={articulos} value={articuloId} onChange={setArticuloId} onCreado={onCreado} />
        <TallaSelect
          categoria={articulos.find(a => a.id === articuloId)?.categoria ?? ''}
          sexo={articulos.find(a => a.id === articuloId)?.sexo ?? ''}
          value={talla}
          onChange={setTalla}
          className={inputCls}
        />
        <input className={inputCls} inputMode="numeric" placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        <div />
        <select className={inputCls} value={origen} onChange={e => setOrigen(e.target.value)}>
          <option value="">Origen…</option>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className={inputCls} value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="">Destino…</option>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <input className={`${inputCls} sm:col-span-2`} placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3"><Button onClick={submit} disabled={pending}>{pending ? 'Transfiriendo…' : 'Transferir'}</Button></div>
    </Panel>
  )
}
