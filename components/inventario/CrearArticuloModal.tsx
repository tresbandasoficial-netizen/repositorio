'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guardarArticuloCatalogoAction } from '@/app/actions/articulos'
import { CategoriaArticulo, SexoArticulo } from '@/types'

export type ArticuloCreado = {
  id: string
  codigo: string | null
  marca: string
  nombre: string
  color: string | null
  sexo: SexoArticulo | null
  categoria: CategoriaArticulo | null
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Modal para crear un artículo del catálogo sin salir del flujo actual
// (entrada de stock, conteo, etc.). Al guardar devuelve el artículo creado
// para seleccionarlo de inmediato.
export function CrearArticuloModal({
  codigoInicial = '',
  onCreado,
  onClose,
}: {
  codigoInicial?: string
  onCreado: (art: ArticuloCreado) => void
  onClose: () => void
}) {
  const router = useRouter()
  const [codigo, setCodigo] = useState(codigoInicial.toUpperCase())
  const [marca, setMarca] = useState('')
  const [nombre, setNombre] = useState('')
  const [referencia, setReferencia] = useState('')
  const [color, setColor] = useState('')
  const [sexo, setSexo] = useState<SexoArticulo | ''>('')
  const [categoria, setCategoria] = useState<CategoriaArticulo | ''>('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!marca.trim() || !nombre.trim()) { setError('Marca y nombre son obligatorios'); return }
    if (!categoria) { setError('Indica si es ropa, tenis o accesorio'); return }
    if (categoria !== 'accesorios' && !sexo) { setError('Indica si es de hombre, de mujer o de niño'); return }
    setError('')
    start(async () => {
      const r = await guardarArticuloCatalogoAction({
        codigo, nombre, marca, referencia, color, sexo, categoria, descripcion: '',
      })
      if (!r.ok) { setError(r.error); return }
      onCreado({
        id: r.articuloId,
        codigo: codigo.trim() || null,
        marca: marca.trim(),
        nombre: nombre.trim(),
        color: color.trim() || null,
        sexo: (sexo || null) as SexoArticulo | null,
        categoria: (categoria || null) as CategoriaArticulo | null,
      })
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Crear artículo nuevo</h2>
            <p className="text-xs text-gray-500 mt-0.5">Se guarda en el catálogo y queda seleccionado para continuar</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Código SKU (ej. JD4546)" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} />
            <input className={inputCls} placeholder="Marca (ej. Nike) *" value={marca} onChange={e => setMarca(e.target.value)} />
            <input className={inputCls} placeholder="Nombre / modelo *" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input className={inputCls} placeholder="Color (ej. Blanco/Negro)" value={color} onChange={e => setColor(e.target.value)} />
            <input className={inputCls} placeholder="Referencia técnica (opcional)" value={referencia} onChange={e => setReferencia(e.target.value)} />
            <select className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value as CategoriaArticulo | '')}>
              <option value="">Categoría… *</option>
              <option value="ropa">Ropa</option>
              <option value="tenis">Tenis</option>
              <option value="accesorios">Accesorios</option>
            </select>
            <select className={inputCls} value={sexo} onChange={e => setSexo(e.target.value as SexoArticulo | '')} disabled={categoria === 'accesorios'}>
              <option value="">{categoria === 'accesorios' ? 'Sexo (no aplica)' : 'Hombre / Mujer… *'}</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
              <option value="nino">Niño</option>
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-2">La talla no va aquí: se indica al registrar la entrada o el conteo.</p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={submit} disabled={pending}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
            {pending ? 'Guardando…' : 'Crear y seleccionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
