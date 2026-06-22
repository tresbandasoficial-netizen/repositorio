'use client'

import { useState, useEffect } from 'react'
import { buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { ItemVenta } from '@/app/actions/ventas'

export type Linea = ItemVenta & { stock?: number | null; key: number }

let _k = 0
export const nuevaLinea = (): Linea => ({
  key: _k++,
  articulo_id: null,
  codigo: '',
  marca: '',
  descripcion: '',
  talla: '',
  cantidad: 1,
  precio_venta: 0,
  color: '',
  sexo: '',
  categoria: '',
})

// Fila aplanada para mostrar en el dropdown (una por cada talla disponible)
type OpcionCatalogo = {
  articulo_id: string
  marca: string
  nombre: string
  color: string | null
  talla: string | null
  stock: number
}

function aplanarOpciones(articulos: ArticuloBusqueda[], sedeId: string | null): OpcionCatalogo[] {
  const result: OpcionCatalogo[] = []
  for (const a of articulos) {
    if (a.tallaStock.length === 0) {
      result.push({ articulo_id: a.id, marca: a.marca, nombre: a.nombre, color: a.color, talla: null, stock: 0 })
    } else {
      for (const ts of a.tallaStock) {
        result.push({ articulo_id: a.id, marca: a.marca, nombre: a.nombre, color: a.color, talla: ts.talla, stock: ts.stock })
      }
    }
  }
  return result
}

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
  const [opciones, setOpciones] = useState<OpcionCatalogo[]>([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (linea.articulo_id) return
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setOpciones([]); return }
      const articulos = await buscarArticulosAction(q, sedeId)
      const ops = aplanarOpciones(articulos, sedeId)
      setOpciones(ops)
      setAbierto(true)
      // Si no hay resultados, pre-llenar el campo código con lo buscado
      if (ops.length === 0 && !linea.codigo) {
        onChange({ codigo: q.trim() })
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, sedeId, linea.articulo_id])

  function elegir(item: OpcionCatalogo) {
    onChange({
      articulo_id: item.articulo_id,
      marca:       item.marca,
      descripcion: item.nombre,
      talla:       item.talla ?? '',
      stock:       item.stock,
    })
    setQ(`${item.marca} ${item.nombre}${item.talla ? ' · ' + item.talla : ''}`)
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
            {opciones.map(item => (
              <button
                key={`${item.articulo_id}-${item.talla ?? ''}`}
                type="button"
                onClick={() => elegir(item)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex justify-between"
              >
                <span>
                  <span className="font-medium text-gray-900">{item.marca} {item.nombre}</span>
                  {item.color && <span className="text-gray-400"> · {item.color}</span>}
                  {item.talla && <span className="text-gray-400"> · T{item.talla}</span>}
                </span>
                <span className={`text-xs ml-2 ${item.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {item.stock} en {sedeCodigo}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {linea.articulo_id != null && linea.stock != null && linea.stock <= 0 && (
        <p className="text-xs text-amber-600">⚠ Sin stock en {sedeCodigo}. Dejará el inventario en negativo (deberás reponerlo).</p>
      )}

      {/* Fila 1: Código · Nombre */}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <input type="text" value={linea.codigo || ''} onChange={e => onChange({ codigo: e.target.value })}
          placeholder="Código" aria-label="Código"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={linea.descripcion} onChange={e => onChange({ descripcion: e.target.value })}
          placeholder="Nombre del producto" aria-label="Nombre del producto"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Fila 2: Marca · Talla · Cant · X */}
      <div className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 items-center">
        <input type="text" value={linea.marca} onChange={e => onChange({ marca: e.target.value })}
          placeholder="Marca" aria-label="Marca"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="text" value={linea.talla} onChange={e => onChange({ talla: e.target.value })}
          placeholder="Talla" aria-label="Talla"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="number" min={1} value={linea.cantidad}
          onChange={e => onChange({ cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
          aria-label="Cantidad"
          className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {onRemove
          ? <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 px-1" title="Quitar">✕</button>
          : <div className="w-6" />}
      </div>

      {/* Fila 3: Color · Sexo · Categoría */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start">
        <input type="text" value={linea.color || ''} onChange={e => onChange({ color: e.target.value })}
          placeholder="Color" aria-label="Color"
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1">
          {(['hombre', 'mujer', 'nino'] as const).map(s => (
            <button key={s} type="button" onClick={() => onChange({ sexo: linea.sexo === s ? '' : s })}
              className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors whitespace-nowrap ${
                linea.sexo === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>{s === 'nino' ? 'Niño' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['ropa', 'tenis', 'accesorios'] as const).map(c => (
            <button key={c} type="button" onClick={() => onChange({ categoria: linea.categoria === c ? '' : c })}
              className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors whitespace-nowrap ${
                linea.categoria === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>{c === 'accesorios' ? 'Accesorios' : c.charAt(0).toUpperCase() + c.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Fila 4: Precio */}
      <input type="text" inputMode="numeric"
        value={linea.precio_venta ? String(linea.precio_venta) : ''}
        onChange={e => onChange({ precio_venta: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
        placeholder="Precio de venta"
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}
