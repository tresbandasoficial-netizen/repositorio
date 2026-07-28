'use client'

import { useEffect, useState } from 'react'
import { buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'

// Una opción por ARTÍCULO, no por artículo+talla: la talla la elige la persona.
// Las tallas viajan solo como información de qué hay en existencia.
export type ArticuloElegido = {
  articulo_id: string
  codigo: string | null
  marca: string
  nombre: string
  color: string | null
  sexo: string | null
  categoria: string | null
  tallas: Array<{ talla: string | null; stock: number }>
}

function aOpciones(arts: ArticuloBusqueda[]): ArticuloElegido[] {
  return arts.map(a => ({
    articulo_id: a.id,
    codigo: a.codigo,
    marca: a.marca,
    nombre: a.nombre,
    color: a.color,
    sexo: a.sexo,
    categoria: a.categoria,
    tallas: a.tallaStock.map(ts => ({ talla: ts.talla, stock: ts.stock })),
  }))
}

// Buscador del catálogo por código, nombre, marca, color o referencia.
//
// Vive aquí porque el mismo listado se usa al crear un pedido, al facturar y en
// las dos pantallas de compras; estaba copiado y las de compras se habían
// quedado con búsqueda por código EXACTO, que solo sirve si uno se lo sabe de
// memoria.
//
// El componente NO decide qué se llena al elegir: solo avisa cuál artículo se
// escogió. Cada pantalla llena lo que le sirve.
export function BuscadorArticulo({
  valor,
  onCambiarTexto,
  onElegir,
  sedeId = null,
  sedeCodigo,
  estado,
  className = '',
  placeholder = 'Código, nombre o marca…',
}: {
  valor: string
  onCambiarTexto: (v: string) => void
  onElegir: (a: ArticuloElegido) => void
  /** null = suma el stock de todas las sedes (lo correcto en compras). */
  sedeId?: string | null
  /** Solo para el rótulo del stock. Sin sede se dice "en total". */
  sedeCodigo?: string
  /** true = enlazado al catálogo, false = no existe, undefined = sin buscar. */
  estado?: boolean
  className?: string
  placeholder?: string
}) {
  const [opciones, setOpciones] = useState<ArticuloElegido[]>([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    // Ya enlazado: no tiene sentido seguir ofreciendo alternativas.
    if (estado === true) { setOpciones([]); setAbierto(false); return }
    const q = valor.trim()
    const t = setTimeout(async () => {
      if (q.length < 2) { setOpciones([]); setAbierto(false); return }
      const ops = aOpciones(await buscarArticulosAction(q, sedeId))
      setOpciones(ops)
      setAbierto(ops.length > 0)
    }, 250)
    return () => clearTimeout(t)
  }, [valor, sedeId, estado])

  const donde = sedeCodigo ? `En ${sedeCodigo}` : 'En stock'

  return (
    <div className="relative">
      <input
        type="text"
        value={valor}
        onChange={e => onCambiarTexto(e.target.value)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {estado === true && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
          ✓
        </span>
      )}

      {abierto && opciones.length > 0 && (
        <div className="absolute z-30 left-0 mt-1 min-w-[24rem] max-w-[min(32rem,90vw)] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {opciones.map(a => {
            const conStock = a.tallas.filter(t => t.stock > 0)
            return (
              <button
                key={a.articulo_id}
                type="button"
                title={`${a.codigo ?? ''} ${a.marca} ${a.nombre}${a.color ? ` · ${a.color}` : ''}`.trim()}
                onMouseDown={() => { onElegir(a); setAbierto(false) }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
              >
                {/* Una cosa por renglón: código, nombre, color, existencias. */}
                {a.codigo && (
                  <span className="block font-mono text-[11px] font-semibold text-blue-700 truncate">{a.codigo}</span>
                )}
                <span className="block font-medium text-gray-900 truncate">
                  {a.marca && <span className="text-gray-500">{a.marca} </span>}
                  {a.nombre}
                </span>
                {a.color && <span className="block text-xs text-gray-400 truncate">{a.color}</span>}
                <span className="block text-xs mt-0.5">
                  {conStock.length > 0 ? (
                    <>
                      <span className="text-gray-400">{donde}: </span>
                      {conStock.map(t => (
                        <span key={t.talla ?? ''} className="text-emerald-700 font-medium mr-1.5">
                          {t.talla ? `T${t.talla}` : 'sin talla'}·{t.stock}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-gray-400">Sin existencias</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
