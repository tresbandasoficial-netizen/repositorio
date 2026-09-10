'use client'

import { useEffect, useState } from 'react'
import { coloresUsadosAction } from '@/app/actions/articulos'

// Cache del módulo: una compra puede tener muchas filas, cada una con su
// ColorSelect — los colores se piden UNA vez por carga de página, no una por
// fila. Si la petición falla se reintenta en el siguiente montaje.
let coloresCache: string[] | null = null
let coloresPromesa: Promise<string[]> | null = null
function cargarColores(): Promise<string[]> {
  if (coloresCache) return Promise.resolve(coloresCache)
  coloresPromesa ??= coloresUsadosAction()
    .then(c => {
      coloresCache = c
      return c
    })
    .catch(() => {
      coloresPromesa = null
      return []
    })
  return coloresPromesa
}

// Selector de color con los colores YA usados en el catálogo (los más usados
// primero): se escoge en vez de escribir, para no seguir creando variantes
// (NEGRO/NEGRA/NEGROS…). "Otro color…" abre el campo libre; un color viejo
// fuera de la lista se muestra como opción extra para no perderlo.
// Mismo patrón que MarcaSelect.
export function ColorSelect({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string
  onChange: (color: string) => void
  className?: string
  disabled?: boolean
}) {
  const [colores, setColores] = useState<string[]>(coloresCache ?? [])
  const [libre, setLibre] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!coloresCache) cargarColores().then(c => { if (vivo && c.length > 0) setColores(c) })
    return () => { vivo = false }
  }, [])

  const conocido = colores.find(c => c.toLowerCase() === value.trim().toLowerCase())

  if (libre) {
    return (
      <div className="relative">
        <input
          type="text"
          autoFocus
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value.toUpperCase())}
          placeholder="Escribe el color…"
          className={`${className ?? ''} w-full pr-7`}
        />
        <button
          type="button"
          onClick={() => { setLibre(false); if (!conocido) onChange('') }}
          title="Volver a la lista de colores"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <select
      value={conocido ?? value}
      disabled={disabled}
      onChange={e => {
        if (e.target.value === '__otro__') { onChange(''); setLibre(true) }
        else onChange(e.target.value)
      }}
      className={className}
    >
      <option value="">Color…</option>
      {colores.map(c => <option key={c} value={c}>{c}</option>)}
      {/* Color viejo fuera de la lista: sigue visible para no perderlo */}
      {value && !conocido && <option value={value}>{value}</option>}
      <option value="__otro__">➕ Otro color…</option>
    </select>
  )
}
