'use client'

import { useEffect } from 'react'
import { TALLAS_ROPA, TALLAS_ROPA_NINO, TALLAS_TENIS, tallasDeCategoria, CategoriaArticulo, SexoArticulo } from '@/types'

// Selector de talla según la categoría del artículo:
//   ropa → 2XS…2XL · ropa de niño → 3 meses…15-16 años · tenis → 5…12 (con
//   medias tallas) · accesorios → sin talla
// Si aún no hay categoría elegida, muestra ambos grupos.
// `stockPorTalla` (opcional): unidades disponibles por talla — se muestran al
// lado de cada opción ("S — 2 disponibles") para vender de una lo que hay.
export function TallaSelect({
  categoria,
  sexo,
  value,
  onChange,
  className,
  stockPorTalla,
}: {
  categoria?: CategoriaArticulo | '' | null
  sexo?: SexoArticulo | '' | null
  value: string
  onChange: (talla: string) => void
  className?: string
  stockPorTalla?: Record<string, number>
}) {
  const esAccesorio = categoria === 'accesorios'

  // "S — 2 disponibles" cuando hay dato de stock para esa talla.
  const etiqueta = (t: string) => {
    const stock = stockPorTalla?.[t.trim().toUpperCase()]
    if (stock == null) return t
    return stock > 0 ? `${t} — ${stock} disponible${stock === 1 ? '' : 's'}` : `${t} — sin stock`
  }

  // Un accesorio no lleva talla: limpiar cualquier valor viejo.
  useEffect(() => {
    if (esAccesorio && value) onChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAccesorio])

  if (esAccesorio) {
    return (
      <select value="" disabled className={`${className ?? ''} bg-gray-50 text-gray-400`}>
        <option value="">Sin talla</option>
      </select>
    )
  }

  const esNino = sexo === 'nino'
  const opciones = tallasDeCategoria(categoria, sexo)
  const grupoRopa = esNino ? TALLAS_ROPA_NINO : TALLAS_ROPA
  const conocidas = opciones.length > 0 ? opciones : [...grupoRopa, ...TALLAS_TENIS]

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Talla…</option>
      {opciones.length > 0 ? (
        opciones.map(t => <option key={t} value={t}>{etiqueta(t)}</option>)
      ) : (
        <>
          <optgroup label={esNino ? 'Ropa niño' : 'Ropa'}>
            {grupoRopa.map(t => <option key={t} value={t}>{etiqueta(t)}</option>)}
          </optgroup>
          <optgroup label="Tenis">
            {TALLAS_TENIS.map(t => <option key={t} value={t}>{etiqueta(t)}</option>)}
          </optgroup>
        </>
      )}
      {/* Tallas viejas fuera de la lista siguen visibles para no perderlas */}
      {value && !conocidas.includes(value) && <option value={value}>{etiqueta(value)}</option>}
    </select>
  )
}
