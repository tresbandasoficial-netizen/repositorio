'use client'

import { useEffect } from 'react'
import { TALLAS_ROPA, TALLAS_TENIS, tallasDeCategoria, CategoriaArticulo } from '@/types'

// Selector de talla según la categoría del artículo:
//   ropa  → 2XS…2XL · tenis → 5…12 (con medias tallas) · accesorios → sin talla
// Si aún no hay categoría elegida, muestra ambos grupos.
export function TallaSelect({
  categoria,
  value,
  onChange,
  className,
}: {
  categoria?: CategoriaArticulo | '' | null
  value: string
  onChange: (talla: string) => void
  className?: string
}) {
  const esAccesorio = categoria === 'accesorios'

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

  const opciones = tallasDeCategoria(categoria)
  const conocidas = opciones.length > 0 ? opciones : [...TALLAS_ROPA, ...TALLAS_TENIS]

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Talla…</option>
      {opciones.length > 0 ? (
        opciones.map(t => <option key={t} value={t}>{t}</option>)
      ) : (
        <>
          <optgroup label="Ropa">
            {TALLAS_ROPA.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
          <optgroup label="Tenis">
            {TALLAS_TENIS.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </>
      )}
      {/* Tallas viejas fuera de la lista siguen visibles para no perderlas */}
      {value && !conocidas.includes(value) && <option value={value}>{value}</option>}
    </select>
  )
}
