'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  crearArticuloAction, registrarEntradaAction, transferirStockAction,
} from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { StockAgrupado } from '@/lib/queries/inventario'
import { Articulo, CategoriaArticulo } from '@/types'

type Sede = { id: string; codigo: string; nombre: string }

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

  const filtradas = q.trim()
    ? filas.filter(f => (f.marca + ' ' + f.nombre + ' ' + (f.talla ?? '')).toLowerCase().includes(q.toLowerCase()))
    : filas

  return (
    <div className="space-y-4">
      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAccion('articulo')} variant="secondary">+ Nuevo artículo</Button>
        <Button onClick={() => setAccion('entrada')} variant="secondary">+ Entrada de stock</Button>
        <Button onClick={() => setAccion('transferencia')} variant="secondary">⇄ Transferir</Button>
      </div>

      {accion === 'articulo' && <CrearArticulo onClose={() => setAccion('none')} />}
      {accion === 'entrada' && <Entrada articulos={articulos} sedes={sedes} onClose={() => setAccion('none')} />}
      {accion === 'transferencia' && <Transferencia articulos={articulos} sedes={sedes} onClose={() => setAccion('none')} />}

      {/* Buscador */}
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar artículo…"
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Tabla de stock */}
      {filtradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {filas.length === 0 ? 'Aún no hay artículos con stock. Crea un artículo y registra una entrada.' : 'Sin resultados'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Artículo</th>
                {columnasSedes.map(s => (
                  <th key={s} className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">{s}</th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(f => (
                <tr key={f.articulo_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{f.marca} {f.nombre}</p>
                    {f.talla && <p className="text-xs text-gray-400">Talla {f.talla}</p>}
                  </td>
                  {columnasSedes.map(s => {
                    const v = f.porSede[s] ?? 0
                    return (
                      <td key={s} className="px-4 py-3 text-center">
                        <span className={v < 0 ? 'text-red-600 font-semibold' : v === 0 ? 'text-gray-300' : 'text-gray-700'}>
                          {v}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-center font-semibold text-gray-900">{f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [talla, setTalla] = useState('')
  const [categoria, setCategoria] = useState<CategoriaArticulo | ''>('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!marca.trim() || !nombre.trim()) { setError('Marca y nombre son obligatorios'); return }
    setError('')
    start(async () => {
      const r = await crearArticuloAction({ nombre, marca, talla, categoria })
      if (!r.ok) { setError(r.error); return }
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Nuevo artículo" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input className={inputCls} placeholder="Marca" value={marca} onChange={e => setMarca(e.target.value)} />
        <input className={inputCls} placeholder="Nombre / modelo" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input className={inputCls} placeholder="Talla" value={talla} onChange={e => setTalla(e.target.value)} />
        <select className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value as CategoriaArticulo | '')}>
          <option value="">Categoría…</option>
          <option value="tenis">Tenis</option>
          <option value="ropa">Ropa</option>
          <option value="accesorio">Accesorio</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3"><Button onClick={submit} disabled={pending}>{pending ? 'Guardando…' : 'Crear artículo'}</Button></div>
    </Panel>
  )
}

function SelectArticulo({ articulos, value, onChange }: { articulos: Articulo[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Artículo…</option>
      {articulos.map(a => (
        <option key={a.id} value={a.id}>{a.marca} {a.nombre}{a.talla ? ` · ${a.talla}` : ''}</option>
      ))}
    </select>
  )
}

function Entrada({ articulos, sedes, onClose }: { articulos: Articulo[]; sedes: Sede[]; onClose: () => void }) {
  const router = useRouter()
  const tr = sedes.find(s => s.codigo === 'TR')
  const [articuloId, setArticuloId] = useState('')
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
    if (!c || c <= 0) { setError('Cantidad inválida'); return }
    if (isNaN(co) || co < 0) { setError('Costo inválido'); return }
    setError('')
    start(async () => {
      const r = await registrarEntradaAction({ articulo_id: articuloId, cantidad: c, costo_unitario_cop: co, sede_id: sedeId || null, notas })
      if (!r.ok) { setError(r.error); return }
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Entrada de stock" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SelectArticulo articulos={articulos} value={articuloId} onChange={setArticuloId} />
        <select className={inputCls} value={sedeId} onChange={e => setSedeId(e.target.value)}>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.codigo === 'TR' ? ' (centro de distribución)' : ''}</option>)}
        </select>
        <input className={inputCls} inputMode="numeric" placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        <input className={inputCls} inputMode="numeric" placeholder="Costo unitario (COP)" value={costo} onChange={e => setCosto(e.target.value)} />
        <input className={`${inputCls} sm:col-span-2`} placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
      </div>
      <p className="text-xs text-gray-400 mt-2">El costo alimenta el promedio ponderado (CPP) usado para calcular utilidades.</p>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3"><Button onClick={submit} disabled={pending}>{pending ? 'Registrando…' : 'Registrar entrada'}</Button></div>
    </Panel>
  )
}

function Transferencia({ articulos, sedes, onClose }: { articulos: Articulo[]; sedes: Sede[]; onClose: () => void }) {
  const router = useRouter()
  const tr = sedes.find(s => s.codigo === 'TR')
  const [articuloId, setArticuloId] = useState('')
  const [origen, setOrigen] = useState<string>(tr?.id ?? '')
  const [destino, setDestino] = useState<string>('')
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    const c = parseInt(cantidad.replace(/\D/g, ''), 10)
    if (!articuloId) { setError('Selecciona un artículo'); return }
    if (!origen || !destino) { setError('Selecciona sede de origen y destino'); return }
    if (origen === destino) { setError('El origen y el destino no pueden ser iguales'); return }
    if (!c || c <= 0) { setError('Cantidad inválida'); return }
    setError('')
    start(async () => {
      const r = await transferirStockAction({ articulo_id: articuloId, sede_origen: origen, sede_destino: destino, cantidad: c, notas })
      if (!r.ok) { setError(r.error); return }
      router.refresh(); onClose()
    })
  }

  return (
    <Panel title="Transferir stock entre sedes" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SelectArticulo articulos={articulos} value={articuloId} onChange={setArticuloId} />
        <input className={inputCls} inputMode="numeric" placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(e.target.value)} />
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
