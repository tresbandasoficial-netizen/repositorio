'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import { buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { registrarVentaInmediataAction, ItemVenta } from '@/app/actions/ventas'
import { Button } from '@/components/ui/Button'
import { formatCOP } from '@/lib/utils/format'
import { MetodoPago, METODOS_PAGO, METODO_PAGO_LABELS } from '@/types'

type Linea = ItemVenta & { stock?: number | null; key: number }

let _k = 0
const nuevaLinea = (): Linea => ({
  key: _k++,
  articulo_id: null,
  marca: '',
  descripcion: '',
  talla: '',
  cantidad: 1,
  precio_venta: 0,
})

export function VentaInmediataForm({ sedeId, sedeCodigo }: { sedeId: string; sedeCodigo: string }) {
  const router = useRouter()

  // Cliente
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([])
  const [cliente, setCliente] = useState<ClienteBusqueda | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cedula, setCedula] = useState('')

  // Items
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()])

  // Pago
  const [abono, setAbono] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [pagaTodo, setPagaTodo] = useState(true)

  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (cliente) return
    const t = setTimeout(async () => {
      if (busqueda.trim().length < 2) { setResultados([]); return }
      setResultados(await buscarClientesAction(busqueda))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, cliente])

  function elegirCliente(c: ClienteBusqueda) {
    setCliente(c)
    setNombre(c.nombre)
    setTelefono(c.telefono_normalizado)
    setCedula(c.cedula ?? '')
    setResultados([])
    setBusqueda(c.nombre)
  }

  function resetCliente() {
    setCliente(null); setBusqueda(''); setNombre(''); setTelefono(''); setCedula('')
  }

  function setLinea(key: number, patch: Partial<Linea>) {
    setLineas(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  const total = lineas.reduce((s, l) => s + l.precio_venta * l.cantidad, 0)
  const abonoNum = pagaTodo ? total : (abono ? parseInt(abono.replace(/\D/g, ''), 10) || 0 : 0)

  function crear() {
    if (!nombre.trim()) { setError('El nombre del cliente es obligatorio'); return }
    if (!telefono.trim()) { setError('El teléfono del cliente es obligatorio'); return }
    const items = lineas.filter(l => l.descripcion.trim() && l.precio_venta > 0)
    if (items.length === 0) { setError('Agrega al menos un producto con precio'); return }
    if (abonoNum > total) { setError('El abono no puede superar el total'); return }
    setError('')

    start(async () => {
      const r = await registrarVentaInmediataAction({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_cedula: cedula,
        items: items.map(({ articulo_id, marca, descripcion, talla, cantidad, precio_venta }) => ({
          articulo_id, marca, descripcion, talla, cantidad, precio_venta,
        })),
        abono: abonoNum,
        metodo_pago: metodo,
        notas,
      })
      if (!r.ok) { setError(r.error); return }
      router.push(`/pedidos/${r.pedidoId}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Cliente */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-2">Cliente</label>
        {!cliente && (
          <div className="relative mb-3">
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente existente…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {resultados.map(c => (
                  <button key={c.id} type="button" onClick={() => elegirCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-gray-400 ml-2">{c.telefono_normalizado}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" value={cedula} onChange={e => setCedula(e.target.value)} placeholder="Cédula (opcional)"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {cliente && (
          <button type="button" onClick={resetCliente} className="text-xs text-blue-600 hover:underline mt-2">
            Limpiar / nuevo cliente
          </button>
        )}
      </div>

      {/* Productos */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-900 mb-3">Productos</label>
        <div className="space-y-3">
          {lineas.map(l => (
            <LineaProducto
              key={l.key}
              linea={l}
              sedeId={sedeId}
              sedeCodigo={sedeCodigo}
              onChange={patch => setLinea(l.key, patch)}
              onRemove={lineas.length > 1 ? () => setLineas(ls => ls.filter(x => x.key !== l.key)) : undefined}
            />
          ))}
        </div>
        <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
          className="text-sm text-blue-600 hover:underline mt-3">
          + Agregar producto
        </button>
      </div>

      {/* Pago */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-lg font-bold text-gray-900">{formatCOP(total)}</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pagaTodo} onChange={e => setPagaTodo(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          Paga el total de contado
        </label>
        {!pagaTodo && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Abono (deja saldo en cartera)</label>
            <input type="text" inputMode="numeric" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Saldo pendiente: {formatCOP(Math.max(0, total - abonoNum))}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Método de pago</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value as MetodoPago)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {METODOS_PAGO.map(m => <option key={m} value={m}>{METODO_PAGO_LABELS[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={crear} disabled={pending || total <= 0} className="w-full">
        {pending ? 'Registrando venta…' : `Registrar venta · ${formatCOP(total)}`}
      </Button>
    </div>
  )
}

function LineaProducto({
  linea, sedeId, sedeCodigo, onChange, onRemove,
}: {
  linea: Linea
  sedeId: string
  sedeCodigo: string
  onChange: (patch: Partial<Linea>) => void
  onRemove?: () => void
}) {
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState<ArticuloBusqueda[]>([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (linea.articulo_id) return
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setOpciones([]); return }
      setOpciones(await buscarArticulosAction(q, sedeId))
      setAbierto(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q, sedeId, linea.articulo_id])

  function elegir(a: ArticuloBusqueda) {
    onChange({
      articulo_id: a.id,
      marca: a.marca,
      descripcion: a.nombre,
      talla: a.talla ?? '',
      stock: a.stock_sede,
    })
    setQ(`${a.marca} ${a.nombre}${a.talla ? ' · ' + a.talla : ''}`)
    setAbierto(false)
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2">
      {/* Buscador de catálogo */}
      <div className="relative">
        <input
          type="text"
          value={linea.articulo_id ? q : q}
          onChange={e => { setQ(e.target.value); if (linea.articulo_id) onChange({ articulo_id: null, stock: null }) }}
          placeholder="Buscar en inventario (o escribe el producto abajo)…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {abierto && opciones.length > 0 && !linea.articulo_id && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {opciones.map(a => (
              <button key={a.id} type="button" onClick={() => elegir(a)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex justify-between">
                <span><span className="font-medium text-gray-900">{a.marca} {a.nombre}</span>
                  {a.talla && <span className="text-gray-400"> · {a.talla}</span>}</span>
                <span className={`text-xs ${a.stock_sede > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {a.stock_sede} en {sedeCodigo}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {linea.articulo_id != null && linea.stock != null && linea.stock <= 0 && (
        <p className="text-xs text-amber-600">⚠ Sin stock en {sedeCodigo}. La venta dejará el inventario en negativo (deberás reponerlo).</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input type="text" value={linea.marca} onChange={e => onChange({ marca: e.target.value })} placeholder="Marca"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={linea.descripcion} onChange={e => onChange({ descripcion: e.target.value })} placeholder="Descripción"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={linea.talla} onChange={e => onChange({ talla: e.target.value })} placeholder="Talla"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1">
          <input type="number" min={1} value={linea.cantidad} onChange={e => onChange({ cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 px-1" title="Quitar">✕</button>
          )}
        </div>
      </div>
      <div>
        <input type="text" inputMode="numeric"
          value={linea.precio_venta ? String(linea.precio_venta) : ''}
          onChange={e => onChange({ precio_venta: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
          placeholder="Precio de venta"
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  )
}
