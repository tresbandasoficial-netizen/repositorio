'use client'

import { useState } from 'react'
import { MARCAS } from '@/types'

// Selector de marca con la lista fija de marcas de la tienda.
// "Otra marca…" abre un campo libre; una marca vieja fuera de la lista se
// muestra como opción extra para no perderla.
export function MarcaSelect({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string
  onChange: (marca: string) => void
  className?: string
  disabled?: boolean
}) {
  const [libre, setLibre] = useState(false)
  const conocida = MARCAS.find(m => m.toLowerCase() === value.trim().toLowerCase())

  if (libre) {
    return (
      <div className="relative">
        <input
          type="text"
          autoFocus
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder="Escribe la marca…"
          className={`${className ?? ''} w-full pr-7`}
        />
        <button
          type="button"
          onClick={() => { setLibre(false); onChange('') }}
          title="Volver a la lista de marcas"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <select
      value={conocida ?? value}
      disabled={disabled}
      onChange={e => {
        if (e.target.value === '__otra__') { onChange(''); setLibre(true) }
        else onChange(e.target.value)
      }}
      className={className}
    >
      <option value="">Marca…</option>
      {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
      {/* Marca vieja fuera de la lista: sigue visible para no perderla */}
      {value && !conocida && <option value={value}>{value}</option>}
      <option value="__otra__">Otra marca…</option>
    </select>
  )
}
