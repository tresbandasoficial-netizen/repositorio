'use client'

import { useState, useEffect } from 'react'
import { buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { ItemVenta } from '@/app/actions/ventas'

export type Linea = ItemVenta & { stock?: number | null; key: number }

let _k = 0
export const nuevaLinea = (): Linea => ({
  key: _k++,
  articulo_id: null,
  marca: '',
  descripcion: '',
  talla: '',
  cantidad: 1,
  precio_venta: 0,
})

export function LineaProducto({
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
          value={q}
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
        <p className="text-xs text-amber-600">⚠ Sin stock en {sedeCodigo}. Dejará el inventario en negativo (deberás reponerlo).</p>
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
