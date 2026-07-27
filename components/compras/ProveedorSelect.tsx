'use client'

import { useEffect, useRef, useState } from 'react'

// Buscador de proveedores. Reemplaza al <datalist>, que los navegadores muestran
// de forma inconsistente (Chrome solo filtra por prefijo y hay que adivinar que
// existe la lista) y que no impide escribir el mismo proveedor de dos formas.
//
// Evita duplicados por escritura: si lo escrito coincide con uno que ya existe
// sin importar mayúsculas ni espacios, se guarda con la escritura que ya estaba.
// Así "Alo", "ALO" y " alo " terminan siendo el mismo "alo" de siempre.
export function ProveedorSelect({
  value, onChange, proveedores, className = '',
}: {
  value: string
  onChange: (v: string) => void
  proveedores: string[]
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const cajaRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic afuera (no sirve onBlur: mata el clic en la opción).
  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) cerrar()
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto, filtro, proveedores])

  const norm = (s: string) => s.trim().toLowerCase()

  function cerrar() {
    setAbierto(false)
    // Al cerrar se consolida lo escrito contra la lista: si ya existe, se usa la
    // escritura existente en vez de crear un duplicado.
    const escrito = filtro.trim()
    if (escrito) {
      const existente = proveedores.find(p => norm(p) === norm(escrito))
      onChange(existente ?? escrito)
    }
    setFiltro('')
  }

  const texto = norm(filtro)
  const coincidencias = texto
    ? proveedores.filter(p => norm(p).includes(texto))
    : proveedores
  const yaExiste = proveedores.some(p => norm(p) === texto)

  return (
    <div ref={cajaRef} className="relative">
      <input
        type="text"
        value={abierto ? filtro : value}
        onFocus={() => { setFiltro(value); setAbierto(true) }}
        onChange={e => { setFiltro(e.target.value); setAbierto(true) }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setAbierto(false); setFiltro('') }
          if (e.key === 'Enter') { e.preventDefault(); cerrar() }
        }}
        placeholder="Busca o escribe el proveedor"
        className={className}
      />

      {abierto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto">
          {coincidencias.length > 0 ? (
            coincidencias.map(p => (
              <button
                key={p}
                type="button"
                onMouseDown={() => { onChange(p); setAbierto(false); setFiltro('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                  norm(p) === norm(value) ? 'font-semibold text-blue-700' : 'text-gray-700'
                }`}
              >
                {p}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-gray-400">Ningún proveedor coincide</p>
          )}

          {/* Solo se ofrece crear cuando de verdad es nuevo. */}
          {filtro.trim() && !yaExiste && (
            <button
              type="button"
              onMouseDown={() => { onChange(filtro.trim()); setAbierto(false); setFiltro('') }}
              className="w-full text-left px-3 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50/60 hover:bg-emerald-50 transition-colors border-t border-gray-100"
            >
              ➕ Nuevo proveedor: &ldquo;{filtro.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
